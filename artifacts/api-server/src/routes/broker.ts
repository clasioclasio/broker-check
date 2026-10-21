import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, checksTable, consultationsTable } from "@workspace/db";
import { CreateCheckBody, GetCheckParams, CreateConsultationBody, CreateCheckResponse, GetCheckResponse, CreateConsultationResponse, GetPlatformResponse } from "@workspace/api-zod";
import { report, platform } from "../lib/report";
import { rateLimit } from "../middlewares/limits";
import { isSupportedPhone } from "../lib/phone";
import { leadMetadata, setLeadOwner } from "./leads";
import { recordTrafficLead } from "../lib/traffic";

const router: IRouter = Router();
router.get("/platform", (_req, res) => { res.json(GetPlatformResponse.parse(platform)); });
router.post("/checks", rateLimit(30, 600_000), async (req, res): Promise<void> => {
  const input = CreateCheckBody.safeParse({
    company: typeof req.body?.company === "string" ? req.body.company.trim() : req.body?.company,
  });
  if (!input.success) {
    res.status(400).json({ error: "Введите название компании от 2 до 200 символов." }); return;
  }
  const [check] = await db.insert(checksTable).values(input.data).returning();
  res.status(201).json(CreateCheckResponse.parse(report(check!)));
});
router.get("/checks/:id", rateLimit(120, 60_000), async (req, res): Promise<void> => {
  const params = GetCheckParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Некорректный номер отчета." }); return; }
  const [check] = await db.select().from(checksTable).where(eq(checksTable.id, params.data.id));
  if (!check) { res.status(404).json({ error: "Отчет не найден. Начните новую проверку." }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json(GetCheckResponse.parse(report(check)));
});
router.post("/consultations", rateLimit(5, 900_000), async (req, res): Promise<void> => {
  const body = req.body && typeof req.body === "object" ? { ...req.body } : {};
  for (const field of ["name", "company", "email", "description"]) {
    if (typeof body[field] === "string") body[field] = body[field].trim();
  }
  if (typeof body.email === "string") body.email = body.email.toLowerCase();
  const parsed = CreateConsultationBody.safeParse(body);
  if (!parsed.success || parsed.data.consent !== true) {
    res.status(400).json({ error: "Проверьте имя, телефон в международном формате, email, название компании и согласие на обработку данных." }); return;
  }
  if (!isSupportedPhone(parsed.data.phone)) {
    res.status(400).json({ error: "Укажите действительный номер телефона с международным кодом страны, начиная с +." }); return;
  }
  const { website: _website, idempotencyKey, ...data } = parsed.data;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    ...data, description: data.description ?? "", day: new Date().toISOString().slice(0, 10),
  })).digest("hex");
  const [inserted] = await db.insert(consultationsTable)
    .values({ ...await leadMetadata(req), ...data, whatsapp: data.phone, idempotencyKey, fingerprint })
    .onConflictDoNothing().returning();
  const saved = inserted ?? (await db.select().from(consultationsTable).where(
    or(eq(consultationsTable.idempotencyKey, idempotencyKey), eq(consultationsTable.fingerprint, fingerprint)),
  ))[0];
  if (!saved || (saved.fingerprint !== fingerprint)) {
    res.status(409).json({ error: "Этот ключ уже использован для другого запроса. Откройте форму заново." }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  // Fingerprint deduplication alone is not proof of ownership of an earlier chat.
  if (inserted || saved.idempotencyKey === idempotencyKey || req.signedCookies?.broker_lead_id === saved.id) {
    setLeadOwner(res, saved.id);
  }
  try { await recordTrafficLead(req, saved.id); }
  catch (error) { req.log.warn({ err: error }, "Conversion recording failed; consultation is saved"); }
  res.status(201).json(CreateConsultationResponse.parse({
    id: saved.id, createdAt: saved.createdAt.toISOString(),
    message: "Ваш запрос успешно отправлен и сохранен. Специалист свяжется с вами по указанным контактным данным.",
  }));
});
export default router;
