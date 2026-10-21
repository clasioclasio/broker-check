import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { eq, desc, sql } from "drizzle-orm";
import { UAParser } from "ua-parser-js";
import { db, consultationsTable as leadsTable, messagesTable, pool } from "@workspace/db";
import { ImportLeadsBody, CreateLeadMessageBody, UpdateLeadStatusBody } from "@workspace/api-zod";
import { isAdmin, requireAdmin } from "./admin";
import { rateLimit } from "../middlewares/limits";
import { ensureTrafficStorage, readTrafficCookie, SESSION_COOKIE, VISITOR_COOKIE } from "../lib/traffic";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function setLeadOwner(res: Response, id: string) {
  res.cookie("broker_lead_id", id, {
    signed: true, httpOnly: true, sameSite: "lax", path: "/api",
    secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400000,
  });
}
const owner = (req: Request) => req.signedCookies?.broker_lead_id;
function access(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const id = req.params.id;
  if (typeof id !== "string" || !uuid.test(id)) { res.status(400).json({ error: "Некорректный номер заявки." }); return; }
  if (!isAdmin(req) && owner(req) !== id) { res.status(403).json({ error: "Нет доступа к этой заявке." }); return; }
  next();
}
const present = (row: typeof leadsTable.$inferSelect) => {
  // Never expose consent records, fingerprints or idempotency keys in this API.
  const { consent: _c, consentVersion: _v, fingerprint: _f, idempotencyKey: _k, ...lead } = row;
  return { ...lead, whatsapp: lead.whatsapp || lead.phone, createdAt: row.createdAt.toISOString() };
};
export async function leadMetadata(req: Request) {
  const ua = new UAParser(req.get("user-agent") || "");
  const meta: Partial<typeof leadsTable.$inferInsert> = {
    device: ua.getDevice().type === "mobile" ? "mobile" : ua.getDevice().type === "tablet" ? "tablet" : "desktop",
    browser: [ua.getBrowser().name, ua.getBrowser().major].filter(Boolean).join(" ") || null,
    os: [ua.getOS().name, ua.getOS().version].filter(Boolean).join(" ") || null,
    language: (req.get("accept-language") || "").slice(0, 40),
  };
  if (req.get("dnt") === "1" || req.get("sec-gpc") === "1") return {};
  const session = readTrafficCookie(req, SESSION_COOKIE), visitor = readTrafficCookie(req, VISITOR_COOKIE);
  if (session && visitor) {
    try {
      await ensureTrafficStorage();
      const { rows } = await pool.query(
        "SELECT ip,country,city,referrer,source,medium,campaign FROM traffic_sessions WHERE id=$1 AND visitor_id=$2",
        [session, visitor],
      );
      const row = rows[0];
      if (row) Object.assign(meta, { ip: row.ip, country: row.country, city: row.city, referrer: row.referrer,
        utmSource: row.source, utmMedium: row.medium, utmCampaign: row.campaign });
    } catch (error) { req.log.warn({ err: error }, "Lead attribution unavailable"); }
  }
  return meta;
}
router.get("/leads/me", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const id = owner(req);
  if (typeof id !== "string" || !uuid.test(id)) { res.status(404).json({ error: "Заявка в этом браузере не найдена." }); return; }
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!lead) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  res.json(present(lead));
});
router.get("/leads", requireAdmin, async (_req, res) => {
  res.json((await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt))).map(present));
});
router.post("/leads/import", requireAdmin, rateLimit(5, 60000), async (req, res) => {
  const parsed = ImportLeadsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Передайте от 1 до 15000 строк CSV." }); return; }
  const str = (v: unknown, max = 500) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const phoneKey = (v: string) => v.replace(/\D/g, "");
  const emailKey = (v: string) => v.trim().toLowerCase();
  let duplicates = 0, invalid = 0, imported = 0;
  // Serialize imports so two simultaneous uploads cannot race duplicate detection.
  await db.transaction(async tx => {
    await tx.execute("SELECT pg_advisory_xact_lock(748201530)");
    const existing = await tx.select({ email: leadsTable.email, phone: leadsTable.phone, whatsapp: leadsTable.whatsapp }).from(leadsTable);
    const emails = new Set(existing.map(row => emailKey(row.email)).filter(Boolean));
    const phones = new Set(existing.flatMap(row => [phoneKey(row.phone), phoneKey(row.whatsapp || "")]).filter(Boolean));
    const values: (typeof leadsTable.$inferInsert)[] = [];
    for (const row of parsed.data.rows) {
      const email = emailKey(str(row.email)), phone = str(row.phone), whatsapp = str(row.whatsapp);
      const contacts = [phoneKey(phone), phoneKey(whatsapp)].filter(Boolean);
      if ((!email && !contacts.length) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
        contacts.some(value => value.length < 5 || value.length > 15)) { invalid++; continue; }
      if ((email && emails.has(email)) || contacts.some(value => phones.has(value))) { duplicates++; continue; }
      if (email) emails.add(email);
      for (const value of contacts) phones.add(value);
      const id = randomUUID();
      values.push({
        id, name: str(row.name, 120) || "Импорт", email, phone: phone || whatsapp || "",
        whatsapp: whatsapp || null, company: str(row.company, 200) || "Не указана",
        problem: str(row.problem, 200) || "Импорт контакта", description: str(row.description, 10000) || "Импортирован из CSV",
        consent: false, consentVersion: "not-collected-csv", source: "import", status: "new",
        idempotencyKey: id, fingerprint: `import:${id}`,
      });
    }
    for (let i = 0; i < values.length; i += 250) {
      const saved = await tx.insert(leadsTable).values(values.slice(i, i + 250)).returning({ id: leadsTable.id });
      imported += saved.length;
    }
  });
  res.json({ imported, duplicates, invalid, total: parsed.data.rows.length });
});
router.get("/leads/:id", access, async (req, res) => {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id as string));
  if (!lead) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  res.json(present(lead));
});
router.patch("/leads/:id/status", requireAdmin, access, async (req, res) => {
  const input = UpdateLeadStatusBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Неизвестный статус." }); return; }
  const [lead] = await db.update(leadsTable).set(input.data).where(eq(leadsTable.id, req.params.id as string)).returning();
  if (!lead) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  res.json(present(lead));
});
router.get("/leads/:id/messages", access, async (req, res) => {
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, req.params.id as string));
  if (!lead) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  res.json(await db.select().from(messagesTable).where(eq(messagesTable.leadId, lead.id)).orderBy(messagesTable.createdAt));
});
router.post("/leads/:id/messages", access, rateLimit(30, 60000), async (req, res) => {
  const input = CreateLeadMessageBody.safeParse({ text: typeof req.body?.text === "string" ? req.body.text.trim() : req.body?.text });
  if (!input.success) { res.status(400).json({ error: "Введите сообщение от 1 до 10000 символов." }); return; }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, req.params.id as string));
  if (!lead) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  const [message] = await db.insert(messagesTable).values({
    leadId: lead.id, sender: isAdmin(req) ? "manager" : "user", text: input.data.text,
  }).returning();
  res.json(message);
});
router.delete("/leads/:id", requireAdmin, access, async (req, res) => {
  await ensureTrafficStorage();
  const deleted = await db.transaction(async tx => {
    const [row] = await tx.delete(leadsTable).where(eq(leadsTable.id, req.params.id as string)).returning({ id: leadsTable.id });
    if (row) {
      await tx.execute(sql`UPDATE traffic_sessions SET lead_id=NULL WHERE lead_id=${row.id}`);
      await tx.execute(sql`DELETE FROM traffic_events WHERE lead_id=${row.id}`);
    }
    return row;
  });
  if (!deleted) { res.status(404).json({ error: "Заявка не найдена." }); return; }
  res.json({ ok: true });
});
export default router;
