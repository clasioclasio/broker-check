import { Router } from "express";
import { pool } from "@workspace/db";
import { ensureTrafficStorage } from "../lib/traffic";
import { csvCell, parseTrafficQuery, trafficWhere, type TrafficQuery } from "../lib/traffic-reporting";
import { requireAdmin } from "./admin";
import type { PoolClient } from "@workspace/db";

const router = Router();
const METRICS = `
 count(DISTINCT s.visitor_id)::int AS visitors,
 count(*)::int AS sessions,
 COALESCE(sum(s.pageviews),0)::int AS pageviews,
 (SELECT count(*)::int FROM traffic_events e JOIN traffic_sessions s ON s.id=e.session_id
   WHERE e.kind='lead_created' AND __WHERE__) AS leads,
 count(*) FILTER(WHERE s.lead_id IS NOT NULL)::int AS "convertedSessions",
 COALESCE(round(100.0*count(*) FILTER(WHERE s.lead_id IS NOT NULL)/NULLIF(count(*),0),2),0)::float AS "conversionRate",
 count(*) FILTER(WHERE s.form_started)::int AS "formStarts",
 COALESCE(sum(s.form_errors),0)::int AS "formErrors",
 COALESCE(sum(s.cta_clicks),0)::int AS "ctaClicks",
 COALESCE(round(100.0*count(*) FILTER(WHERE s.last_seen_at < now()-interval '30 minutes'
   AND s.pageviews<=1 AND s.seconds<10 AND NOT s.form_started AND s.cta_clicks=0 AND s.lead_id IS NULL)
   /NULLIF(count(*) FILTER(WHERE s.last_seen_at < now()-interval '30 minutes'),0),2),0)::float AS "bounceRate",
 COALESCE(round(avg(s.seconds),1),0)::float AS "averageSeconds",
 count(DISTINCT s.visitor_id) FILTER(WHERE s.last_seen_at > now()-interval '5 minutes')::int AS "activeNow",
 count(DISTINCT s.visitor_id) FILTER(WHERE EXISTS(
   SELECT 1 FROM traffic_sessions prior WHERE prior.visitor_id=s.visitor_id AND prior.started_at<s.started_at
 ))::int AS "returningVisitors"
`;

async function metrics(client: PoolClient, query: TrafficQuery, previous = false) {
  const { where, params } = trafficWhere(query, previous);
  const result = await client.query(`SELECT ${METRICS.replace("__WHERE__", where)} FROM traffic_sessions s WHERE ${where}`, params);
  return result.rows[0];
}

async function breakdown(client: PoolClient, query: TrafficQuery, dimension: string) {
  const { where, params } = trafficWhere(query);
  const result = await client.query(
    `SELECT ${dimension} AS name,count(*)::int AS sessions,count(DISTINCT s.visitor_id)::int AS visitors,
     COALESCE(sum((SELECT count(*) FROM traffic_events e WHERE e.session_id=s.id AND e.kind='lead_created')),0)::int AS leads,
     COALESCE(round(100.0*count(*) FILTER(WHERE s.lead_id IS NOT NULL)/NULLIF(count(*),0),2),0)::float AS "conversionRate"
     FROM traffic_sessions s WHERE ${where} GROUP BY 1 ORDER BY sessions DESC,name LIMIT 30`, params,
  );
  return result.rows;
}

const SESSION_FIELDS = `
 s.id,s.visitor_id AS "visitorId",s.started_at AS "startedAt",s.last_seen_at AS "lastSeenAt",
 CASE WHEN s.started_at >= now()-interval '30 days' THEN s.ip ELSE NULL END AS ip,
 s.country,s.city,s.device,s.browser,s.os,s.language,s.timezone,s.screen,
 s.source,s.medium,s.campaign,s.content,s.term,s.entry_path AS "entryPath",s.referrer,
 s.pageviews,s.seconds,s.scroll,s.form_started AS "formStarted",s.form_errors AS "formErrors",
 s.cta_clicks AS "ctaClicks",s.lead_id AS "leadId"
`;

router.get("/admin/traffic", requireAdmin, async (req, res) => {
  let query: TrafficQuery;
  try { query = parseTrafficQuery(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  let client: PoolClient | undefined;
  try {
    await ensureTrafficStorage();
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const current = await metrics(client, query);
    const previous = await metrics(client, query, true);
    const { where, params } = trafficWhere(query);
    const { where: baseWhere, params: baseParams } = trafficWhere(query, false, false);
    const dailyResult = await client.query(
      `SELECT to_char(s.started_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
       count(DISTINCT s.visitor_id)::int AS visitors,count(*)::int AS sessions,
       COALESCE(sum((SELECT count(*) FROM traffic_events e WHERE e.session_id=s.id AND e.kind='lead_created')),0)::int AS leads
       FROM traffic_sessions s WHERE ${where} GROUP BY 1 ORDER BY 1`, params,
    );
    const days = new Map(dailyResult.rows.map(row => [row.date, row]));
    const daily = [];
    for (let day = Date.parse(query.from); day <= Date.parse(query.to); day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      daily.push(days.get(date) || { date, visitors: 0, sessions: 0, leads: 0 });
    }
    const sources = await breakdown(client, query, "s.source");
    const campaigns = await breakdown(client, query, "COALESCE(NULLIF(s.campaign,''),'Без кампании')");
    const devices = await breakdown(client, query, "s.device");
    const countries = await breakdown(client, query, "COALESCE(s.country,'Unknown')");
    const browsers = await breakdown(client, query, "s.browser");
    const landingPages = await breakdown(client, query, "s.entry_path");
    const options: Record<string, string[]> = {};
    for (const [name, field] of [["sources", "source"], ["campaigns", "campaign"], ["devices", "device"], ["countries", "country"]]) {
      const result = await client.query(
        `SELECT DISTINCT COALESCE(s.${field},'Unknown') AS value FROM traffic_sessions s
         WHERE ${baseWhere} AND COALESCE(s.${field},'Unknown')<>'' ORDER BY value LIMIT 500`, baseParams,
      );
      options[name!] = result.rows.map(row => row.value);
    }
    const pageSize = 25;
    const total = current.sessions;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const sessions = await client.query(
      `SELECT ${SESSION_FIELDS} FROM traffic_sessions s WHERE ${where}
       ORDER BY s.started_at DESC,s.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params,
    );
    await client.query("COMMIT");
    res.set("Cache-Control", "no-store");
    res.json({
      range: { from: query.from, to: query.to, timezone: "UTC" },
      metrics: current, previous, daily, sources, campaigns, devices, countries, browsers, landingPages,
      funnel: [
        { name: "Сеансы", sessions: current.sessions },
        { name: "Начали форму", sessions: current.formStarts },
        { name: "Отправили заявку", sessions: current.convertedSessions },
      ],
      options, sessions: sessions.rows, pagination: { page, pageSize, total },
      retention: { days: 90, ipDays: 30, exportLimit: 10000 },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err: error }, "Traffic report failed");
    res.status(503).json({ error: "Статистика временно недоступна. Проверьте доступ API к базе данных." });
  } finally { client?.release(); }
});

router.get("/admin/traffic/export", requireAdmin, async (req, res) => {
  let query: TrafficQuery;
  try { query = parseTrafficQuery(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  try {
    await ensureTrafficStorage();
    const { where, params } = trafficWhere(query);
    const result = await pool.query(
      `SELECT ${SESSION_FIELDS} FROM traffic_sessions s WHERE ${where}
       ORDER BY s.started_at DESC,s.id LIMIT 10000`, params,
    );
    const headers: Record<string, string> = {
      id: "Session ID", visitorId: "Visitor ID", startedAt: "Started UTC", lastSeenAt: "Last seen UTC",
      ip: "IP (30 days)", country: "Country (approximate)", city: "City (approximate)", device: "Device",
      browser: "Browser", os: "OS", language: "Language", timezone: "Timezone", screen: "Screen",
      source: "Source", medium: "Medium", campaign: "UTM campaign", content: "UTM content", term: "UTM term",
      entryPath: "Landing path", referrer: "Referrer host", pageviews: "Pageviews", seconds: "Active seconds",
      scroll: "Scroll percent", formStarted: "Form started", formErrors: "Form errors", ctaClicks: "CTA clicks", leadId: "Confirmed lead ID",
    };
    const csv = [Object.values(headers).map(csvCell).join(","),
      ...result.rows.map(row => Object.keys(headers).map(key => csvCell(row[key] instanceof Date ? row[key].toISOString() : row[key])).join(","))].join("\r\n");
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="broker-check-traffic-${query.from}-${query.to}.csv"`,
      "X-Export-Limit": "10000",
      "X-Export-Rows": String(result.rowCount),
    });
    res.send("\uFEFF" + csv);
  } catch (error) {
    req.log.error({ err: error }, "Traffic export failed");
    res.status(503).json({ error: "Не удалось выгрузить статистику" });
  }
});
export default router;
