import { notifyUnauthorized } from "@/lib/admin-api";

const API = `${import.meta.env.BASE_URL}api`;
export interface TrafficFilters {
  from: string;
  to: string;
  source?: string;
  campaign?: string;
  device?: string;
  country?: string;
  page?: number;
}

export interface TrafficMetrics {
  visitors: number;
  sessions: number;
  pageviews: number;
  leads: number;
  convertedSessions: number;
  conversionRate: number;
  formStarts: number;
  formErrors: number;
  ctaClicks: number;
  bounceRate: number;
  averageSeconds: number;
  activeNow: number;
  returningVisitors: number;
}

export interface TrafficBreakdown {
  name: string;
  sessions: number;
  visitors: number;
  leads: number;
  conversionRate: number;
}

export interface TrafficSession {
  id: string;
  visitorId: string;
  startedAt: string;
  lastSeenAt: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  device: string;
  browser: string;
  os: string;
  language: string;
  timezone: string;
  screen: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  entryPath: string;
  referrer: string;
  pageviews: number;
  seconds: number;
  scroll: number;
  formStarted: boolean;
  formErrors: number;
  ctaClicks: number;
  leadId: string | null;
}

export interface TrafficReport {
  range: { from: string; to: string; timezone: string };
  metrics: TrafficMetrics;
  previous: TrafficMetrics;
  daily: { date: string; visitors: number; sessions: number; leads: number }[];
  sources: TrafficBreakdown[];
  campaigns: TrafficBreakdown[];
  devices: TrafficBreakdown[];
  countries: TrafficBreakdown[];
  browsers: TrafficBreakdown[];
  landingPages: TrafficBreakdown[];
  funnel: { name: string; sessions: number }[];
  options: { sources: string[]; campaigns: string[]; devices: string[]; countries: string[] };
  sessions: TrafficSession[];
  pagination: { page: number; pageSize: number; total: number };
  retention: { days: number; ipDays: number; exportLimit: number };
}

function query(filters: TrafficFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
}

export async function getTrafficReport(filters: TrafficFilters, signal?: AbortSignal): Promise<TrafficReport> {
  const response = await fetch(`${API}/admin/traffic?${query(filters)}`, { credentials: "include", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) notifyUnauthorized();
    if (response.status === 401) throw new Error("Сессия администратора истекла. Авторизуйтесь заново.");
    throw new Error(body.error || "Не удалось загрузить статистику");
  }
  return response.json();
}

export async function exportTraffic(filters: TrafficFilters): Promise<void> {
  const response = await fetch(`${API}/admin/traffic/export?${query(filters)}`, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Не удалось выгрузить статистику");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `broker-check-traffic-${filters.from}-${filters.to}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
