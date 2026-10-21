import type { TrafficCollect as ApiTrafficCollect, TrafficCollectEventsItemKind } from "@workspace/api-client-react";
const API = `${import.meta.env.BASE_URL}api`;
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
type Kind = TrafficCollectEventsItemKind;
type TrafficCollect = ApiTrafficCollect;
function rawPath() {
  const p = location.pathname;
  return (BASE_PATH && p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) : p) || "/";
}
function currentPath() {
  const p = rawPath();
  if (p.startsWith("/analysis")) return "/analysis";
  if (p.startsWith("/results")) return "/results";
  return "/";
}
function isAdminPath() { return rawPath() === "/admin" || rawPath().startsWith("/admin/"); }

export type TrafficConsentChoice = "accepted" | "denied" | null;
const KEY = "broker-check-analytics-consent-v1";
let enabled = false;
let queue: TrafficCollect["events"] = [];
let flight: Promise<void> | null = null;
let metadata: Omit<TrafficCollect, "events"> | null = null;
let retries = 0;
let formStarted = false;
let scheduled: ReturnType<typeof setTimeout> | undefined;

export function privacySignal() {
  return navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
export function readTrafficConsent(): TrafficConsentChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "accepted" || stored === "denied" ? stored : null;
  } catch { return null; }
}
export function saveTrafficConsent(choice: Exclude<TrafficConsentChoice, null>) {
  localStorage.setItem(KEY, choice);
}
export function trackTraffic(kind: Kind, value = 0) {
  if (!enabled || isAdminPath() || privacySignal() || readTrafficConsent() === "denied" || !metadata) return;
  if (typeof crypto.randomUUID !== "function") return; // HTTPS is required for analytics IDs.
  queue.push({ id: crypto.randomUUID(), kind, path: currentPath(), value });
  if (queue.length > 100) queue.shift();
  if (!scheduled) scheduled = setTimeout(() => {
    scheduled = undefined;
    void flushTraffic();
  }, 150);
}
export function flushTraffic(): Promise<void> {
  if (flight) return flight;
  if (!enabled || privacySignal() || readTrafficConsent() === "denied" || !metadata || !queue.length) return Promise.resolve();
  const batch = queue.splice(0, 20);
  flight = (async () => {
    try {
      const response = await fetch(`${API}/analytics/collect`, {
        method: "POST", credentials: "include", keepalive: true,
        signal: AbortSignal.timeout(2500),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metadata, events: batch }),
      });
      if (!response.ok) throw new Error(`Traffic collector: ${response.status}`);
      retries = 0;
    } catch (error) {
      if (enabled && retries++ < 3) queue = [...batch, ...queue].slice(0, 100);
      console.warn("Не удалось передать событие аналитики; отправка заявки не блокируется.", error);
    } finally {
      flight = null;
      if (enabled && queue.length && !scheduled) scheduled = setTimeout(() => {
        scheduled = undefined; void flushTraffic();
      }, 3000);
    }
  })();
  return flight;
}

export async function revokeTrafficConsent() {
  enabled = false;
  queue = [];
  if (scheduled) clearTimeout(scheduled);
  scheduled = undefined;
  // Wait for earlier requests before deleting history, so late requests cannot
  // recreate it after the visitor has withdrawn consent.
  if (flight) await flight;
  const response = await fetch(`${API}/analytics/consent`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error("Сбор отключён, но историю удалить не удалось. Повторите попытку позже.");
}

export function startTrafficTracking() {
  if (enabled || isAdminPath() || privacySignal() || readTrafficConsent() === "denied") return () => {};
  enabled = true;
  const externalConsent = readTrafficConsent() === "accepted";
  formStarted = false;
  const params = new URLSearchParams(location.search);
  const limit = (key: string) => params.get(key)?.slice(0, 160) || undefined;
  let referrer = document.referrer;
  try { if (new URL(referrer).hostname === location.hostname) referrer = ""; } catch { /* No referrer. */ }
  metadata = {
    consent: externalConsent, path: currentPath(), referrer: referrer.slice(0, 500),
    language: navigator.language.slice(0, 40),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 80),
    screen: `${screen.width}×${screen.height}`.slice(0, 30),
    utmSource: limit("utm_source"), utmMedium: limit("utm_medium"), utmCampaign: limit("utm_campaign"),
    utmContent: limit("utm_content"), utmTerm: limit("utm_term"),
    hasFbclid: params.has("fbclid"), hasGclid: params.has("gclid"),
  };
  trackTraffic("pageview");
  let lastActivity = Date.now(), previousTick = Date.now(), maxScroll = 0;
  const activity = () => { lastActivity = Date.now(); };
  const heartbeat = () => {
    const now = Date.now();
    if (document.visibilityState === "visible" && now - lastActivity < 60000) {
      trackTraffic("heartbeat", Math.min(30, Math.round((now - previousTick) / 1000)));
    }
    previousTick = now;
  };
  const scroll = () => {
    activity();
    const height = document.documentElement.scrollHeight - innerHeight;
    const percent = height > 0 ? Math.min(100, Math.floor(scrollY / height * 100 / 25) * 25) : 100;
    if (percent > maxScroll) { maxScroll = percent; trackTraffic("scroll", percent); }
  };
  const focus = (event: FocusEvent) => {
    activity();
    if (!formStarted && event.target instanceof HTMLElement && event.target.closest("[data-testid='form-consultation'], [data-testid='form-report-request']")) {
      formStarted = true; trackTraffic("form_start");
    }
  };
  const click = (event: MouseEvent) => {
    const el = event.target instanceof Element ? event.target.closest("button, a") : null;
    if (el && !el.closest("form") && !el.closest("[data-testid='section-consultation'] button[type=submit]")) trackTraffic("cta_click");
  };
  const pagehide = () => { heartbeat(); void flushTraffic(); };
  const interval = setInterval(heartbeat, 10000);
  window.addEventListener("pointerdown", activity, { passive: true });
  window.addEventListener("keydown", activity);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("pagehide", pagehide);
  document.addEventListener("click", click);
  document.addEventListener("focusin", focus);
  return () => {
    heartbeat(); void flushTraffic();
    enabled = false;
    queue = [];
    clearInterval(interval);
    if (scheduled) clearTimeout(scheduled);
    scheduled = undefined;
    window.removeEventListener("pointerdown", activity);
    window.removeEventListener("keydown", activity);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("pagehide", pagehide);
    document.removeEventListener("click", click);
    document.removeEventListener("focusin", focus);
  };
}
