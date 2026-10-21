import { pgTable, uuid, text, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const trafficSessionsTable = pgTable("traffic_sessions", {
  id: uuid("id").primaryKey(),
  visitorId: uuid("visitor_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  country: text("country"),
  city: text("city"),
  device: text("device").notNull(),
  browser: text("browser").notNull(),
  os: text("os").notNull(),
  language: text("language").notNull().default(""),
  timezone: text("timezone").notNull().default(""),
  screen: text("screen").notNull().default(""),
  source: text("source").notNull(),
  medium: text("medium").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  content: text("content").notNull().default(""),
  term: text("term").notNull().default(""),
  entryPath: text("entry_path").notNull(),
  referrer: text("referrer").notNull().default(""),
  pageviews: integer("pageviews").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
  scroll: integer("scroll").notNull().default(0),
  formStarted: boolean("form_started").notNull().default(false),
  formErrors: integer("form_errors").notNull().default(0),
  ctaClicks: integer("cta_clicks").notNull().default(0),
  leadId: uuid("lead_id"),
}, table => [
  index("traffic_sessions_started_idx").on(table.startedAt),
  index("traffic_sessions_visitor_idx").on(table.visitorId),
  index("traffic_sessions_source_idx").on(table.source, table.campaign),
]);

export const trafficEventsTable = pgTable("traffic_events", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => trafficSessionsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  value: integer("value").notNull().default(0),
  leadId: uuid("lead_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("traffic_events_session_idx").on(table.sessionId),
  uniqueIndex("traffic_events_lead_idx").on(table.leadId),
]);

// Additive, idempotent provisioning for existing VPS installations. No existing
// lead/message table is altered and no historical traffic is fabricated.
export const TRAFFIC_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS traffic_sessions (
 id uuid PRIMARY KEY, visitor_id uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 ip text, country text, city text, device text NOT NULL, browser text NOT NULL, os text NOT NULL,
 language text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT '', screen text NOT NULL DEFAULT '',
 source text NOT NULL, medium text NOT NULL DEFAULT '', campaign text NOT NULL DEFAULT '',
 content text NOT NULL DEFAULT '', term text NOT NULL DEFAULT '',
 entry_path text NOT NULL, referrer text NOT NULL DEFAULT '',
 pageviews integer NOT NULL DEFAULT 0, seconds integer NOT NULL DEFAULT 0, scroll integer NOT NULL DEFAULT 0,
 form_started boolean NOT NULL DEFAULT false, form_errors integer NOT NULL DEFAULT 0,
 cta_clicks integer NOT NULL DEFAULT 0, lead_id uuid
);
CREATE INDEX IF NOT EXISTS traffic_sessions_started_idx ON traffic_sessions(started_at);
CREATE INDEX IF NOT EXISTS traffic_sessions_visitor_idx ON traffic_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS traffic_sessions_source_idx ON traffic_sessions(source,campaign);
CREATE TABLE IF NOT EXISTS traffic_events (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES traffic_sessions(id) ON DELETE CASCADE,
 kind text NOT NULL, path text NOT NULL, value integer NOT NULL DEFAULT 0,
 lead_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_events_session_idx ON traffic_events(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS traffic_events_lead_idx ON traffic_events(lead_id);
`;
