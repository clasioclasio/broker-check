const BASE = `${import.meta.env.BASE_URL}api`;
export const UNAUTHORIZED_EVENT = "broker-admin-unauthorized";
export const notifyUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

export class ApiError extends Error {
  field?: string;
  status?: number;
  constructor(message: string, field?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.field = field;
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("Не удалось соединиться с сервером. Проверьте подключение к интернету и повторите попытку.");
  }
  if (res.status === 401 && !path.startsWith("/admin/login") && !path.startsWith("/admin/me") && path !== "/leads/me") notifyUnauthorized();
  if (!res.ok) {
    const fallback = [502, 503, 504].includes(res.status)
      ? "Сервер временно недоступен. Подождите несколько секунд и повторите попытку."
      : "Не удалось выполнить запрос. Повторите попытку.";
    const err = await res.json().catch(() => ({ error: fallback })) as { error?: string; field?: string };
    throw new ApiError(err.error ?? fallback, err.field, res.status);
  }
  return res.json() as Promise<T>;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  phone?: string;
  description: string;
  company?: string | null;
  problem?: string | null;
  status: string;
  // Analytics
  ip?: string | null;
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  language?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  source?: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  leadId: string;
  sender: "user" | "manager";
  text: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt: string;
}

// ── Leads ──────────────────────────────────────────────────────────────────────
export const submitLead = (data: {
  name: string;
  email: string;
  whatsapp?: string;
  phone?: string;
  description: string;
  language?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}) => req<{ id: string; status: string }>("/leads", { method: "POST", body: JSON.stringify(data) });

export const getMyLead = () => req<Lead>("/leads/me");
export const getLeads = () => req<Lead[]>("/leads");
export const getLead = (id: string) => req<Lead>(`/leads/${id}`);
export const updateLeadStatus = (id: string, status: string) =>
  req<Lead>(`/leads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const deleteLead = (id: string) =>
  req<{ ok: boolean }>(`/leads/${id}`, { method: "DELETE" });
export const importLeadsBatch = (rows: Array<Record<string, string>>) =>
  req<{ imported: number; duplicates: number; invalid: number; total: number }>("/leads/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

const IMPORT_BATCH = 2000;

export async function importLeads(
  rows: Array<Record<string, string>>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ imported: number; duplicates: number; invalid: number; total: number }> {
  let imported = 0, duplicates = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
    const batch = rows.slice(i, i + IMPORT_BATCH);
    const res = await importLeadsBatch(batch);
    imported  += res.imported;
    duplicates += res.duplicates;
    invalid   += res.invalid;
    onProgress?.(Math.min(i + IMPORT_BATCH, rows.length), rows.length);
  }
  return { imported, duplicates, invalid, total: rows.length };
}

// ── Messages ──────────────────────────────────────────────────────────────────
export const getMessages = (leadId: string) => req<Message[]>(`/leads/${leadId}/messages`);
export const sendMessage = (leadId: string, text: string) =>
  req<Message>(`/leads/${leadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
// ── Admin Auth ────────────────────────────────────────────────────────────────
export const adminLogin = (username: string, password: string) =>
  req<{ ok: boolean }>("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
export const adminLogout = () => req<{ ok: boolean }>("/admin/logout", { method: "POST", body: "{}" });
export const adminMe = () => req<{ ok: boolean; role: string }>("/admin/me");
