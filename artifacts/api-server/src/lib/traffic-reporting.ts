export interface TrafficQuery {
  from: string; to: string; source?: string; campaign?: string; device?: string; country?: string; page: number;
}
const DAY = 86400000;
export function parseTrafficQuery(input: Record<string, unknown>): TrafficQuery {
  const date = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new Error("Укажите корректные даты в формате ГГГГ-ММ-ДД");
    }
    return value;
  };
  const from = date(input.from), to = date(input.to);
  const span = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (span < 1 || span > 90) throw new Error("Выберите период от 1 до 90 дней");
  const page = input.page === undefined ? 1 : Number(input.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new Error("Некорректная страница");
  const result: TrafficQuery = { from, to, page };
  for (const key of ["source", "campaign", "device", "country"] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== "string" || value.length > 160) throw new Error("Некорректный фильтр");
      if (value) result[key] = value;
    }
  }
  return result;
}

export function trafficWhere(query: TrafficQuery, previous = false, filters = true) {
  const start = Date.parse(query.from);
  const end = Date.parse(query.to) + DAY;
  const duration = end - start;
  const params: (Date | string)[] = [new Date(previous ? start - duration : start), new Date(previous ? start : end)];
  const conditions = ["s.started_at >= $1", "s.started_at < $2", "s.started_at >= now()-interval '90 days'"];
  if (filters) for (const key of ["source", "campaign", "device", "country"] as const) {
    if (query[key]) {
      params.push(query[key]!);
      conditions.push(key === "country" ? `COALESCE(s.country,'Unknown')=$${params.length}` : `s.${key}=$${params.length}`);
    }
  }
  return { where: conditions.join(" AND "), params };
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
