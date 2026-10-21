import { Router } from "express";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { UAParser } from "ua-parser-js";
import { CollectTrafficBody } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import {
  acquisition, clearTrafficCookies, ensureTrafficStorage,
  readTrafficCookie, safePath, SESSION_COOKIE, setTrafficCookie, VISITOR_COOKIE, EXTERNAL_CONSENT_COOKIE,
} from "../lib/traffic";
import { validTokens } from "./admin";

const router = Router();
const limiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false });
const bots = /bot\b|crawler|spider|headless|facebookexternalhit|preview|slurp|lighthouse|monitoring/i;

router.post("/analytics/collect", limiter, async (req, res) => {
  const token = req.cookies?.admin_token;
  if (req.get("dnt") === "1" || req.get("sec-gpc") === "1" ||
      bots.test(req.get("user-agent") || "") || (typeof token === "string" && validTokens.has(token))) {
    res.status(204).end(); return;
  }
  const parsed = CollectTrafficBody.safeParse(req.body);
  if (!parsed.success ||
      safePath(parsed.data.path) === "/other" ||
      parsed.data.events.some(event => event.path && safePath(event.path) === "/other")) {
    res.status(400).json({ error: "Некорректное событие аналитики" }); return;
  }
  const body = parsed.data;
  if (JSON.stringify(body).length > 16000) {
    res.status(413).json({ error: "Слишком большой пакет событий" }); return;
  }
  let client;
  try {
    await ensureTrafficStorage();
    client = await pool.connect();
    await client.query("BEGIN");
    // Serialise first requests by visitor; event retries have stable UUIDs.
    const visitor = readTrafficCookie(req, VISITOR_COOKIE) || randomUUID();
    const previous = readTrafficCookie(req, SESSION_COOKIE);
    let session = previous;
    let found = previous ? await client.query(
      "SELECT id FROM traffic_sessions WHERE id=$1 AND visitor_id=$2 AND last_seen_at > now()-interval '30 minutes' FOR UPDATE",
      [previous, visitor],
    ) : null;
    let created = false;
    if (!found?.rowCount) {
      session = randomUUID();
      const ua = new UAParser(req.get("user-agent") || "");
      const { source, medium, referrer } = acquisition(body);
      await client.query(
        `INSERT INTO traffic_sessions
        (id,visitor_id,ip,device,browser,os,language,timezone,screen,source,medium,campaign,content,term,entry_path,referrer)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [session, visitor, req.ip?.replace(/^::ffff:/, "") || null,
          ua.getDevice().type === "mobile" ? "mobile" : ua.getDevice().type === "tablet" ? "tablet" : "desktop",
          [ua.getBrowser().name, ua.getBrowser().major].filter(Boolean).join(" ") || "Unknown",
          [ua.getOS().name, ua.getOS().version].filter(Boolean).join(" ") || "Unknown",
          body.language || "", body.timezone || "", body.screen || "",
          source, medium, body.utmCampaign || "", body.utmContent || "", body.utmTerm || "", safePath(body.path), referrer],
      );
      created = true;
    }
    const increments = { pageviews: 0, seconds: 0, scroll: 0, formStarted: false, formErrors: 0, ctaClicks: 0 };
    for (const event of body.events) {
      const result = await client.query(
        "INSERT INTO traffic_events(id,session_id,kind,path,value) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
        [event.id, session, event.kind, safePath(event.path || body.path), event.value],
      );
      if (!result.rowCount) continue;
      if (event.kind === "pageview") increments.pageviews++;
      if (event.kind === "heartbeat") increments.seconds += Math.min(event.value, 30);
      if (event.kind === "scroll") increments.scroll = Math.max(increments.scroll, Math.min(event.value, 100));
      if (event.kind === "form_start") increments.formStarted = true;
      if (event.kind === "form_error") increments.formErrors++;
      if (event.kind === "cta_click") increments.ctaClicks++;
    }
    await client.query(
      `UPDATE traffic_sessions SET last_seen_at=now(), pageviews=pageviews+$2,
       seconds=LEAST(seconds+$3,86400), scroll=GREATEST(scroll,$4),
       form_started=form_started OR $5, form_errors=form_errors+$6, cta_clicks=cta_clicks+$7 WHERE id=$1`,
      [session, increments.pageviews, increments.seconds, increments.scroll, increments.formStarted, increments.formErrors, increments.ctaClicks],
    );
    await client.query("COMMIT");
    setTrafficCookie(res, VISITOR_COOKIE, visitor, 365 * 86400000);
    setTrafficCookie(res, SESSION_COOKIE, session!, 30 * 60000);
    if (body.consent) {
      setTrafficCookie(res, EXTERNAL_CONSENT_COOKIE, visitor, 365 * 86400000);
    } else {
      res.clearCookie(EXTERNAL_CONSENT_COOKIE, {
        path: "/api", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      });
    }
    res.json({ ok: true });
    // No third-party geolocation or advertising requests are enabled in this project.
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err: error }, "Traffic collection unavailable");
    res.status(503).json({ error: "Сбор статистики временно недоступен" });
  } finally { client?.release(); }
});

router.delete("/analytics/consent", limiter, async (req, res) => {
  const visitor = readTrafficCookie(req, VISITOR_COOKIE);
  try {
    if (visitor) {
      await ensureTrafficStorage();
      await pool.query("DELETE FROM traffic_sessions WHERE visitor_id=$1", [visitor]);
    }
    clearTrafficCookies(res);
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Analytics consent deletion failed");
    res.status(503).json({ error: "Не удалось удалить историю аналитики. Повторите попытку." });
  }
});
export default router;
