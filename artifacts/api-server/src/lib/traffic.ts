import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request, Response } from "express";
import { pool, TRAFFIC_SCHEMA_SQL } from "@workspace/db";
import { logger } from "./logger";

const signingKey = process.env.SESSION_SECRET || randomBytes(48).toString("hex");
export const SESSION_COOKIE = "broker_traffic_session";
export const VISITOR_COOKIE = "broker_traffic_visitor";
export const EXTERNAL_CONSENT_COOKIE = "broker_external_consent";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let ready: Promise<void> | undefined;

export function ensureTrafficStorage(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(748201529)");
        await client.query(TRAFFIC_SCHEMA_SQL);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })().catch(error => { ready = undefined; throw error; });
  }
  return ready;
}

export async function sweepTraffic() {
  await ensureTrafficStorage();
  await pool.query("DELETE FROM traffic_sessions WHERE started_at < now() - interval '90 days'");
  await pool.query("UPDATE traffic_sessions SET ip = NULL WHERE ip IS NOT NULL AND started_at < now() - interval '30 days'");
}

export function startTrafficMaintenance() {
  void sweepTraffic().catch(error => logger.error({ err: error }, "Analytics storage unavailable; intake is unaffected"));
  const timer = setInterval(() => {
    void sweepTraffic().catch(error => logger.error({ err: error }, "Analytics retention cleanup failed"));
  }, 6 * 60 * 60 * 1000);
  timer.unref();
}

function mac(id: string) { return createHmac("sha256", signingKey).update(id).digest("hex"); }
export function readTrafficCookie(req: Request, name: string): string | null {
  const value = req.cookies?.[name];
  if (typeof value !== "string") return null;
  const [id, signature, extra] = value.split(".");
  if (!id || !signature || extra || !uuid.test(id) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(id), "hex")) ? id : null;
}

export function setTrafficCookie(res: Response, name: string, id: string, age: number) {
  res.cookie(name, `${id}.${mac(id)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api", maxAge: age,
  });
}
export function clearTrafficCookies(res: Response) {
  for (const name of [SESSION_COOKIE, VISITOR_COOKIE, EXTERNAL_CONSENT_COOKIE]) {
    res.clearCookie(name, { path: "/api", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
}
export function safePath(value: string | undefined): string {
  // Paths only. Never store customer status IDs, query strings or form contents.
  const path = (value || "/").split(/[?#]/)[0]!;
  if (path === "/") return "/";
  if (path === "/analysis") return "/analysis";
  if (path === "/results" || /^\/results\/[a-f0-9-]+$/i.test(path)) return "/results";
  return "/other";
}
export function safeReferrer(value: string | undefined): string {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.hostname.slice(0, 160) : "";
  } catch { return ""; }
}
export function acquisition(input: {
  utmSource?: string; utmMedium?: string; referrer?: string; hasFbclid?: boolean; hasGclid?: boolean;
}) {
  const referrer = safeReferrer(input.referrer);
  const source = input.utmSource || (input.hasGclid ? "google" : input.hasFbclid ? "facebook" : referrer || "direct");
  // fbclid is attached to organic Facebook links too; it alone does not prove an ad click.
  const medium = input.utmMedium || (input.hasGclid ? "cpc" : input.hasFbclid ? "social" :
    /(^|\.)(google|bing|yahoo|duckduckgo)\./i.test(referrer) ? "organic" : referrer ? "referral" : "none");
  return { source, medium, referrer };
}

function publicIP(input: string) {
  const ip = input.replace(/^::ffff:/, "");
  if (!isIP(ip)) return null;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a! >= 224 ||
        (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127) ||
        (a === 198 && (b === 18 || b === 19))) return null;
  } else if (ip === "::1" || ip === "::" || /^(fc|fd|fe[89ab])/i.test(ip)) return null;
  return ip;
}

let geoInFlight = 0;
const geoCache = new Map<string, { until: number; country: string | null; city: string | null }>();
export async function enrichTrafficLocation(sessionId: string, inputIP: string | null) {
  const ip = inputIP && publicIP(inputIP);
  if (!ip || geoInFlight >= 3) return;
  const cached = geoCache.get(ip);
  let geo = cached && cached.until > Date.now() ? cached : null;
  if (!geo) {
    geoInFlight++;
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,city`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("Geo provider unavailable");
      const result = await response.json() as { success?: boolean; country?: string; city?: string };
      geo = {
        until: Date.now() + (result.success ? 86400000 : 300000),
        country: result.success ? (result.country || "").slice(0, 160) || null : null,
        city: result.success ? (result.city || "").slice(0, 160) || null : null,
      };
    } catch {
      geo = { until: Date.now() + 300000, country: null, city: null };
    } finally { geoInFlight--; }
    if (geoCache.size >= 2000) geoCache.delete(geoCache.keys().next().value!);
    geoCache.set(ip, geo);
  }
  if (geo.country || geo.city) {
    await pool.query("UPDATE traffic_sessions SET country=$2, city=$3 WHERE id=$1", [sessionId, geo.country, geo.city]);
  }
}

export async function recordTrafficLead(req: Request, leadId: string) {
  if (req.get("dnt") === "1" || req.get("sec-gpc") === "1") return;
  const session = readTrafficCookie(req, SESSION_COOKIE);
  const visitor = readTrafficCookie(req, VISITOR_COOKIE);
  if (!session || !visitor) return;
  await ensureTrafficStorage();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id FROM traffic_sessions WHERE id=$1 AND visitor_id=$2 AND last_seen_at > now()-interval '30 minutes' FOR UPDATE",
      [session, visitor],
    );
    if (found.rowCount) {
      const inserted = await client.query(
        "INSERT INTO traffic_events(id,session_id,kind,path,lead_id) VALUES($1,$2,'lead_created','/',$3) ON CONFLICT DO NOTHING RETURNING id",
        [randomUUID(), session, leadId],
      );
      if (inserted.rowCount) {
        await client.query("UPDATE traffic_sessions SET lead_id=COALESCE(lead_id,$2), form_started=true, last_seen_at=now() WHERE id=$1", [session, leadId]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
