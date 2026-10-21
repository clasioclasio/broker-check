import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, RefreshCw, TrendingDown, TrendingUp, Minus, ChevronLeft, ChevronRight, AlertCircle, Info } from "lucide-react";
import { exportTraffic, getTrafficReport, type TrafficBreakdown, type TrafficFilters, type TrafficMetrics, type TrafficReport } from "@/lib/analytics-api";
import "./traffic-dashboard.css";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (days: number) => iso(new Date(Date.now() - days * DAY));
const PRESETS = [
  { id: "today", label: "Сегодня", from: () => shift(0), to: () => shift(0) },
  { id: "yesterday", label: "Вчера", from: () => shift(1), to: () => shift(1) },
  { id: "7", label: "7 дней", from: () => shift(6), to: () => shift(0) },
  { id: "30", label: "30 дней", from: () => shift(29), to: () => shift(0) },
  { id: "90", label: "90 дней", from: () => shift(89), to: () => shift(0) },
];
const nf = new Intl.NumberFormat("ru");
const num = (n: number) => nf.format(n);
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("ru")}%`;
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с` : `${Math.round(s)} с`);
const dt = (s: string) => new Date(s).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

type KpiDef = { key: keyof TrafficMetrics; label: string; fmt: (n: number) => string; lowerBetter?: boolean; noDelta?: boolean };
const KPIS: KpiDef[] = [
  { key: "visitors", label: "Посетители", fmt: num },
  { key: "sessions", label: "Сессии", fmt: num },
  { key: "pageviews", label: "Просмотры", fmt: num },
  { key: "leads", label: "Заявки", fmt: num },
  { key: "convertedSessions", label: "Подтв. сессии", fmt: num },
  { key: "conversionRate", label: "Конверсия", fmt: pct },
  { key: "formStarts", label: "Начато форм", fmt: num },
  { key: "formErrors", label: "Ошибки форм", fmt: num, lowerBetter: true },
  { key: "ctaClicks", label: "Клики CTA", fmt: num },
  { key: "bounceRate", label: "Отказы", fmt: pct, lowerBetter: true },
  { key: "averageSeconds", label: "Время на сайте", fmt: dur },
  { key: "returningVisitors", label: "Вернувшиеся", fmt: num },
  { key: "activeNow", label: "Активны за 5 мин", fmt: num, noDelta: true },
];

function Delta({ cur, prev, lowerBetter, isPct }: { cur: number; prev: number; lowerBetter?: boolean; isPct?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="td-delta td-delta--flat"><Minus aria-hidden="true" /> без изменений</span>;
  if (prev === 0) return <span className="td-delta td-delta--flat">нет данных за прошлый период</span>;
  const diff = isPct ? cur - prev : ((cur - prev) / prev) * 100;
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return <span className="td-delta td-delta--flat"><Minus aria-hidden="true" /> 0{isPct ? " п.п." : "%"}</span>;
  const up = rounded > 0;
  const good = lowerBetter ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`td-delta ${good ? "td-delta--good" : "td-delta--bad"}`}>
      <Icon aria-hidden="true" /> {up ? "+" : "−"}{Math.abs(rounded).toLocaleString("ru")}{isPct ? " п.п." : "%"}
      <span className="td-sr"> {good ? "улучшение" : "ухудшение"} к прошлому периоду</span>
    </span>
  );
}

function Breakdown({ title, rows }: { title: string; rows: TrafficBreakdown[] }) {
  const max = Math.max(1, ...rows.map(r => r.sessions));
  return (
    <section className="td-card" aria-label={title}>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="td-empty">Нет данных за период</p> : (
        <div className="td-scroll">
          <table className="td-table">
            <thead><tr><th scope="col">Название</th><th scope="col" className="r">Сессии</th><th scope="col" className="r">Посет.</th><th scope="col" className="r">Заявки</th><th scope="col" className="r">CR</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td><div className="td-name" title={r.name}>{r.name || "(не указано)"}</div><i className="td-bar" style={{ width: `${(r.sessions / max) * 100}%` }} /></td>
                  <td className="r">{num(r.sessions)}</td><td className="r">{num(r.visitors)}</td><td className="r">{num(r.leads)}</td><td className="r">{pct(r.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function TrafficDashboard() {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(PRESETS[3].from());
  const [to, setTo] = useState(PRESETS[3].to());
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [device, setDevice] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const dateError = from > to ? "Дата начала позже даты окончания" : "";
  const filters: TrafficFilters = useMemo(() => ({ from, to, source, campaign, device, country }), [from, to, source, campaign, device, country]);

  const load = useCallback(async (silent: boolean) => {
    if (dateError) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    if (!silent) setLoading(true);
    try {
      const r = await getTrafficReport({ ...filters, page }, c.signal);
      if (c.signal.aborted) return;
      setReport(r); setError(""); setUpdated(new Date());
    } catch (e) {
      if (c.signal.aborted || (e as Error).name === "AbortError") return;
      setError((e as Error).message || "Не удалось загрузить статистику");
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [filters, page, dateError]);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 30000);
    return () => { clearInterval(id); ctl.current?.abort(); };
  }, [load]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const pickPreset = (id: string) => {
    const p = PRESETS.find(x => x.id === id)!;
    setPreset(id); setFrom(p.from()); setTo(p.to()); setPage(1);
  };
  const doExport = async () => {
    if (dateError) return;
    setExporting(true); setExportError("");
    try { await exportTraffic(filters); } catch (e) { setExportError((e as Error).message || "Не удалось выгрузить статистику"); } finally { setExporting(false); }
  };

  const isAuth = /401|авториз|unauthor/i.test(error);
  const opts = report?.options;
  const sel = (label: string, value: string, set: (v: string) => void, list: string[] = [], any: string) => (
    <label className="td-field"><span>{label}</span>
      <select value={value} onChange={e => reset(set)(e.target.value)}>
        <option value="">{any}</option>
        {value && !list.includes(value) && <option value={value}>{value}</option>}
        {list.map(o => <option key={o} value={o}>{o || "(не указано)"}</option>)}
      </select>
    </label>
  );

  const funnel = report?.funnel ?? [];
  const fTop = Math.max(1, funnel[0]?.sessions ?? 0);
  const total = report?.pagination.total ?? 0;
  const pageSize = report?.pagination.pageSize || 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const m = report?.metrics, p = report?.previous;

  return (
    <div className="td-root">
      <div className="td-controls">
        <div className="td-presets" role="group" aria-label="Период (UTC)">
          {PRESETS.map(x => <button key={x.id} type="button" aria-pressed={preset === x.id} onClick={() => pickPreset(x.id)}>{x.label}</button>)}
        </div>
        <label className="td-field"><span>С (UTC)</span><input type="date" value={from} max={to} onChange={e => { setPreset("custom"); setFrom(e.target.value); setPage(1); }} /></label>
        <label className="td-field"><span>По (UTC)</span><input type="date" value={to} min={from} onChange={e => { setPreset("custom"); setTo(e.target.value); setPage(1); }} /></label>
        {sel("Источник", source, v => setSource(v), opts?.sources, "Все источники")}
        {sel("Кампания", campaign, v => setCampaign(v), opts?.campaigns, "Все кампании")}
        {sel("Устройство", device, v => setDevice(v), opts?.devices, "Все устройства")}
        {sel("Страна", country, v => setCountry(v), opts?.countries, "Все страны")}
        <div className="td-actions">
          <button type="button" className="ad-btn ad-btn--ghost" onClick={() => load(false)} disabled={loading || !!dateError}><RefreshCw aria-hidden="true" className={loading ? "ad-spin" : ""} /> Обновить</button>
          <button type="button" className="ad-btn" onClick={doExport} disabled={exporting || !!dateError}><Download aria-hidden="true" /> {exporting ? "Выгрузка…" : "CSV"}</button>
        </div>
      </div>

      {dateError && <p className="ad-error" role="alert">{dateError}</p>}
      {exportError && <p className="ad-error" role="alert">Экспорт: {exportError}</p>}
      <p className="td-hint">
        <Info aria-hidden="true" /> CSV: не более {num(report?.retention.exportLimit ?? 10000)} строк за выгрузку — при большем объёме сузьте период или фильтры.
        {updated && <> Обновлено {updated.toLocaleTimeString("ru")} · автообновление каждые 30 с.</>}
      </p>

      {error && (
        <div className="td-error" role="alert">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>{isAuth ? "Сессия администратора истекла" : "Ошибка загрузки"}</b>
            <p>{isAuth ? "Войдите в админ-панель заново, затем повторите." : error}</p>
          </div>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={() => load(false)}>Повторить</button>
        </div>
      )}

      {!report && loading && !error && (
        <div className="td-skel" aria-busy="true" aria-label="Загрузка статистики">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
      )}

      {report && m && p && !error && !dateError && (
        <div className={`td-body ${loading ? "td-body--busy" : ""}`} aria-busy={loading}>
          <section className="td-kpis" aria-label="Ключевые показатели">
            {KPIS.map(k => (
              <div className="td-kpi" key={k.key}>
                <span className="td-kpi-l">{k.label}</span>
                <b className="td-kpi-v">{k.fmt(m[k.key])}</b>
                {k.noDelta ? <span className="td-delta td-delta--flat">в реальном времени</span>
                  : <Delta cur={m[k.key]} prev={p[k.key]} lowerBetter={k.lowerBetter} isPct={k.key === "conversionRate" || k.key === "bounceRate"} />}
              </div>
            ))}
          </section>
          <p className="td-hint">Сравнение — с предыдущим периодом той же длины в пределах сохранённой истории. Когорты считаются по началу сессии (first-touch). Конверсия и отказы — в процентах, разница в п.п. Отказ — завершённая сессия с одним просмотром, менее 10 с активности и без действий с формой или CTA. Все даты и время — UTC.</p>

          <div className="td-grid2">
            <section className="td-card" aria-label="Динамика по дням">
              <h3>Динамика по дням (UTC)</h3>
              {report.daily.length === 0 || report.daily.every(d => !d.visitors && !d.sessions && !d.leads) ? (
                <p className="td-empty">За выбранный период визитов пока нет</p>
              ) : (
                <div className="td-chart" role="img" aria-label="График посетителей, сессий и заявок по дням">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#e3defa" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5).split("-").reverse().join(".")} tick={{ fontSize: 11, fill: "#5d5675" }} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5d5675" }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e3defa", fontFamily: "Golos Text" }} />
                      <Area type="monotone" dataKey="sessions" name="Сессии" stroke="#6a4cff" fill="#efebff" strokeWidth={2} />
                      <Area type="monotone" dataKey="visitors" name="Посетители" stroke="#9b86ff" fill="transparent" strokeWidth={2} />
                      <Area type="monotone" dataKey="leads" name="Заявки" stroke="#d9a400" fill="#ffe66d55" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="td-legend"><span><i style={{ background: "#6a4cff" }} />Сессии</span><span><i style={{ background: "#9b86ff" }} />Посетители</span><span><i style={{ background: "#d9a400" }} />Заявки</span></div>
            </section>

            <section className="td-card" aria-label="Воронка">
              <h3>Воронка сессий</h3>
              {funnel.length === 0 ? <p className="td-empty">Нет данных</p> : (
                <ol className="td-funnel">
                  {funnel.map((f, i) => (
                    <li key={f.name}>
                      <div className="td-f-head"><span>{f.name}</span><b>{num(f.sessions)}</b></div>
                      <div className="td-f-track"><i style={{ width: `${(f.sessions / fTop) * 100}%` }} /></div>
                      <small>{i === 0 ? "100% от сессий" : `${pct(funnel[i - 1].sessions ? (f.sessions / funnel[i - 1].sessions) * 100 : 0)} от предыдущего шага · ${pct(fTop ? (f.sessions / fTop) * 100 : 0)} от сессий`}</small>
                    </li>
                  ))}
                </ol>
              )}
              <p className="td-note">Сессии → начало формы → подтверждённая конверсия.</p>
            </section>
          </div>

          <div className="td-grid3">
            <Breakdown title="Источники" rows={report.sources} />
            <Breakdown title="Кампании" rows={report.campaigns} />
            <Breakdown title="Устройства" rows={report.devices} />
            <Breakdown title="Страны" rows={report.countries} />
            <Breakdown title="Браузеры" rows={report.browsers} />
            <Breakdown title="Посадочные страницы" rows={report.landingPages} />
          </div>

          <section className="td-card" aria-label="Визиты">
            <h3>Визиты и сессии <span className="td-muted">· {num(total)}</span></h3>
            {report.sessions.length === 0 ? <p className="td-empty">Сессий по выбранным фильтрам нет</p> : (
              <div className="td-scroll td-scroll--wide" tabIndex={0} role="region" aria-label="Таблица сессий">
                <table className="td-table td-table--sessions">
                  <thead><tr>
                    <th scope="col">Начало</th><th scope="col">IP</th><th scope="col">Локация</th><th scope="col">Атрибуция</th>
                    <th scope="col">Вход</th><th scope="col">Устройство</th><th scope="col">Вовлечённость</th><th scope="col">Заявка</th>
                  </tr></thead>
                  <tbody>
                    {report.sessions.map(s => (
                      <tr key={s.id}>
                        <td className="nw">{dt(s.startedAt)}<br /><span className="td-muted">{s.visitorId.slice(0, 8)}</span></td>
                        <td className="mono">{s.ip ?? <span className="td-muted" title="IP удалён по сроку хранения">удалён</span>}</td>
                        <td>{[s.city, s.country].filter(Boolean).join(", ") || "—"}<br /><span className="td-muted">≈ приблизительно</span></td>
                        <td><b>{s.source || "direct"}</b> / {s.medium || "—"}<br /><span className="td-muted">{[s.campaign, s.content, s.term].filter(Boolean).join(" · ") || "—"}</span></td>
                        <td><div className="td-name" title={s.entryPath}>{s.entryPath || "/"}</div><span className="td-muted td-name" title={s.referrer}>{s.referrer || "без реферера"}</span></td>
                        <td>{s.device}<br /><span className="td-muted">{s.browser} · {s.os}<br />{s.screen} · {s.language}</span></td>
                        <td className="nw">{s.pageviews} стр. · {dur(s.seconds)}<br /><span className="td-muted">прокрутка {pct(s.scroll)} · CTA {s.ctaClicks}<br />{s.formStarted ? "форма начата" : "форма не начата"}{s.formErrors ? ` · ошибок ${s.formErrors}` : ""}</span></td>
                        <td className="mono">{s.leadId ? <span className="td-lead">{s.leadId}</span> : <span className="td-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="td-pager">
              <span>Страница {report.pagination.page} из {pages}</span>
              <div>
                <button type="button" className="ad-btn ad-btn--ghost" disabled={page <= 1 || loading} onClick={() => setPage(x => Math.max(1, x - 1))}><ChevronLeft aria-hidden="true" /> Назад</button>
                <button type="button" className="ad-btn ad-btn--ghost" disabled={page >= pages || loading} onClick={() => setPage(x => x + 1)}>Далее <ChevronRight aria-hidden="true" /></button>
              </div>
            </div>
          </section>

          <aside className="td-disclose" aria-label="О данных">
            <b>О данных</b>
            <ul>
              <li>Внутренняя статистика собирается автоматически, без кнопок. Ранее отказавшиеся посетители, браузеры с DNT/GPC, авторизованные администраторы и распознанные боты не учитываются.</li>
              <li>Геолокация приблизительная, определяется по IP.</li>
              <li>Статистика хранится {report.retention.days} дн., сырые IP — {report.retention.ipDays} дн.</li>
              <li>Прошлые визиты не восстанавливаются: данные собираются с момента запуска трекера.</li>
              <li>Расходы на рекламу и ROAS не учитываются — показаны только визиты, заявки и конверсия.</li>
              <li>В каждом разрезе показаны 30 крупнейших значений, в списках фильтров — до 500. CSV содержит до 10 000 последних сессий.</li>
              <li>Посетитель определяется cookie, не IP: другой браузер или удаление cookie считаются новым посетителем. Распознавание ботов основано на User-Agent и не гарантирует исключение всех автоматических визитов.</li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
