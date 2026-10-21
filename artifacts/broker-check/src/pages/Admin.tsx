import { useEffect, useRef, useState } from "react";
import {
  UNAUTHORIZED_EVENT, adminLogin, adminLogout, adminMe, getLeads, getMessages, sendMessage, updateLeadStatus, deleteLead, importLeads,
  type Lead, type Message,
} from "@/lib/admin-api";
import { Send, LogOut, MessageSquare, RefreshCw, Table2, MessageCircle, Copy, Trash2, Check, FileText, Globe, Monitor, Smartphone, Tablet, MapPin, Languages, Link2, BarChart2, ChevronDown as ChevDown, ChevronLeft, Upload, X, AlertCircle } from "lucide-react";
import "./admin.css";
import TrafficDashboard from "@/components/admin/TrafficDashboard";

function AdminLogo({ tag }: { tag?: string }) {
  return (
    <span className="ad-logo">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <rect width="36" height="36" rx="12" fill="#6a4cff" />
        <path d="M9 11.5A3.5 3.5 0 0 1 12.5 8h11a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5H17l-5 4.5V22h-.5A3.5 3.5 0 0 1 9 18.5Z" fill="#fff" />
        <path d="m13.5 15 3 3 5.5-6" fill="none" stroke="#6a4cff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      BROKER CHECK{tag && <small>{tag}</small>}
    </span>
  );
}

// ── Audio / Notification utilities ────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}

// Initialize AudioContext on first user gesture so it's ready later
function primeAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function playTone(freq1: number, freq2: number, duration: number, volume = 0.22) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(freq1, t);
  osc.frequency.exponentialRampToValueAtTime(freq2, t + duration * 0.3);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

// New message from client — soft double chime
function playMessageSound() {
  try {
    playTone(880, 1046, 0.18, 0.18);
    setTimeout(() => playTone(1046, 1318, 0.25, 0.14), 180);
  } catch {}
}

// New lead — stronger descending chime
function playLeadSound() {
  try {
    playTone(1318, 880, 0.2, 0.25);
    setTimeout(() => playTone(1046, 784, 0.3, 0.2), 200);
  } catch {}
}

function requestNotifPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function showBrowserNotif(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "/favicon.ico" }); } catch {}
}


const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "closed", label: "Завершено" },
];
const KNOWN = ["new", "in_progress", "closed"];
const statusKey = (s: string) => (KNOWN.includes(s) ? s : "new");
function statusLabel(s: string) {
  return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
}

// ── Login page ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    primeAudio();
    setLoading(true); setError("");
    try {
      await adminLogin(username, password);
      onLogin();
    } catch (err) {
      setError((err as Error).message ?? "Неверные данные");
    } finally { setLoading(false); }
  };

  return (
    <div className="ad-root admin-root ad-root--center">
      <div className="ad-login">
        <AdminLogo tag="Админ" />
        <p className="ad-login-sub">Панель управления заявками</p>
        <form onSubmit={handleSubmit}>
          <div>
            <label className="ad-label" htmlFor="ad-user">Логин</label>
            <input id="ad-user" className="ad-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
          </div>
          <div>
            <label className="ad-label" htmlFor="ad-pass">Пароль</label>
            <input id="ad-pass" className="ad-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {error && <p className="ad-error" role="alert">{error}</p>}
          <button type="submit" className="ad-btn ad-btn--block" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Attachment bubble ──────────────────────────────────────────────────────────
function AttachmentBubble({ url, name }: { url: string; name: string; isManager: boolean }) {
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="ad-img">
        <img src={url} alt={name} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="ad-file">
      <FileText aria-hidden="true" />
      <span>{name}</span>
    </a>
  );
}

// ── Analytics card ────────────────────────────────────────────────────────────
function AnalyticsCard({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const DeviceIcon = lead.device === "mobile" ? Smartphone : lead.device === "tablet" ? Tablet : Monitor;
  const hasGeo = lead.country || lead.city;
  const hasDevice = lead.device || lead.browser || lead.os;
  const hasUtm = lead.utmSource || lead.utmMedium || lead.utmCampaign;
  const hasAny = hasGeo || hasDevice || lead.language || lead.referrer || hasUtm;
  if (!hasAny) return null;

  return (
    <div className="ad-an">
      <button type="button" className="ad-an-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span><BarChart2 aria-hidden="true" /> Аналитика</span>
        <ChevDown aria-hidden="true" className={open ? "ad-rot" : ""} />
      </button>
      {open && (
        <div className="ad-an-grid">
          {(lead.country || lead.city) && (
            <div className="ad-an-row ad-an-wide">
              <MapPin aria-hidden="true" />
              <span>
                {[lead.city, lead.country].filter(Boolean).join(", ")}
                {lead.countryCode && <em> ({lead.countryCode})</em>}
              </span>
            </div>
          )}
          {lead.ip && (
            <div className="ad-an-row"><Globe aria-hidden="true" /><span className="ad-mono">{lead.ip}</span></div>
          )}
          {lead.language && (
            <div className="ad-an-row"><Languages aria-hidden="true" /><span style={{ textTransform: "uppercase" }}>{lead.language}</span></div>
          )}
          {(lead.device || lead.browser || lead.os) && (
            <div className="ad-an-row ad-an-wide">
              <DeviceIcon aria-hidden="true" />
              <span>
                {[lead.browser, lead.os].filter(Boolean).join(" · ")}
                {lead.device && <em> ({lead.device})</em>}
              </span>
            </div>
          )}
          {lead.referrer && (
            <div className="ad-an-row ad-an-wide"><Link2 aria-hidden="true" /><span className="ad-muted">{lead.referrer}</span></div>
          )}
          {hasUtm && (
            <div className="ad-an-wide ad-utm">
              {lead.utmSource && <span>src: {lead.utmSource}</span>}
              {lead.utmMedium && <span>medium: {lead.utmMedium}</span>}
              {lead.utmCampaign && <span>campaign: {lead.utmCampaign}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────
function ChatPanel({ lead, onStatusChange, onBack }: { lead: Lead; onStatusChange: (l: Lead) => void; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const knownMsgIds = useRef(new Set<string>());
  const initialLoad = useRef(true);

  useEffect(() => {
    knownMsgIds.current = new Set();
    initialLoad.current = true;
    const poll = async () => {
      try {
        const fresh = await getMessages(lead.id);
        if (!initialLoad.current) {
          const newClientMsgs = fresh.filter(
            m => !knownMsgIds.current.has(m.id) && m.sender !== "manager"
          );
          if (newClientMsgs.length > 0) {
            playMessageSound();
            showBrowserNotif(
              "Новое сообщение — BROKER CHECK",
              `${lead.name}: ${newClientMsgs[0].text?.slice(0, 80) ?? "Файл"}`
            );
          }
        }
        fresh.forEach(m => knownMsgIds.current.add(m.id));
        initialLoad.current = false;
        setMessages(fresh);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [lead.id]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (isAtBottom.current) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(lead.id, text.trim());
      setMessages(m => [...m, msg]);
      setText("");
      if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    } catch {} finally { setSending(false); }
  };

  const handleStatus = async (status: string) => {
    try {
      const updated = await updateLeadStatus(lead.id, status);
      onStatusChange(updated);
    } catch {}
  };

  return (
    <div className="ad-chat">
      <div className="ad-chat-head">
        <div className="ad-chat-info">
          <div className="ad-chat-name">
            <button type="button" className="ad-icon-btn ad-back" onClick={onBack} aria-label="Назад к списку заявок">
              <ChevronLeft aria-hidden="true" />
            </button>
            {lead.name}
          </div>
          <div className="ad-contacts">
            <span>{lead.email}</span>
            {lead.whatsapp && <span>WA: {lead.whatsapp}</span>}
            {lead.phone && <span>Тел: {lead.phone}</span>}
            {waLink(lead) && <a href={waLink(lead)} target="_blank" rel="noopener noreferrer">Открыть WhatsApp</a>}
          </div>
          {(lead.company || lead.problem) && (
            <div className="ad-contacts">
              {lead.company && <span>Компания: {lead.company}</span>}
              {lead.problem && <span>Проблема: {lead.problem}</span>}
            </div>
          )}
          <div className="ad-desc">{lead.description}</div>
          <AnalyticsCard lead={lead} />
        </div>
        <div className="ad-statuses" role="group" aria-label="Статус заявки">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => handleStatus(s.value)}
              aria-pressed={lead.status === s.value}
              className={`ad-status-btn ad-status-btn--${s.value}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="ad-msgs">
        {messages.length === 0 && (
          <div className="ad-empty">
            <span className="ad-empty-ico"><MessageSquare aria-hidden="true" /></span>
            <p>Нет сообщений в чате</p>
          </div>
        )}
        {messages.map(m => {
          const isManager = m.sender === "manager";
          return (
            <div key={m.id} className={`ad-bubble ${isManager ? "ad-bubble--mgr" : ""}`}>
              <span className="ad-who">{isManager ? "Менеджер" : "Клиент"}</span>
              {m.text && <div className="ad-text">{m.text}</div>}
              {m.attachmentUrl && m.attachmentName && (
                <AttachmentBubble url={m.attachmentUrl} name={m.attachmentName} isManager={isManager} />
              )}
              <span className="ad-time">
                {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="ad-compose">
        <textarea
          ref={textareaRef}
          rows={1}
          className="ad-textarea"
          aria-label="Ответ клиенту"
          placeholder="Напишите ответ клиенту..."
          value={text}
          onChange={e => { setText(e.target.value); autoResize(); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button type="button" className="ad-send" onClick={handleSend} disabled={sending || !text.trim()} aria-label="Отправить" title="Отправить">
          <Send aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function waLink(lead: Lead): string | undefined {
  const raw = lead.whatsapp || lead.phone || "";
  if (!/^\+[1-9]\d{6,14}$/.test(raw.replace(/[\s()-]/g, ""))) return undefined;
  return `https://wa.me/${raw.replace(/\D/g, "")}`;
}

function copyLeadText(lead: Lead) {
  const lines = [
    `Имя: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.whatsapp ? `WhatsApp: ${lead.whatsapp}` : null,
    lead.phone ? `Телефон: ${lead.phone}` : null,
    lead.company ? `Компания: ${lead.company}` : null,
    lead.problem ? `Проблема: ${lead.problem}` : null,
    `Описание: ${lead.description}`,
    `Статус: ${STATUS_OPTIONS.find(s => s.value === lead.status)?.label ?? lead.status}`,
    `Дата: ${new Date(lead.createdAt).toLocaleString("ru")}`,
    `ID: ${lead.id}`,
  ].filter(Boolean).join("\n");
  navigator.clipboard.writeText(lines).catch(() => {});
}

// ── Leads table ───────────────────────────────────────────────────────────────
// ── CSV parsing ────────────────────────────────────────────────────────────────
// Detect the most common delimiter on the first line (Excel-RU often uses ";").
function detectDelim(line: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

function parseCSVRaw(text: string, delim: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

const HEADER_MAP: Record<string, "name" | "email" | "phone" | "whatsapp" | "company" | "problem"> = {
  company: "company", компания: "company", брокер: "company", problem: "problem", проблема: "problem",
  name: "name", имя: "name", фио: "name", "ф.и.о.": "name", контакт: "name", clientname: "name",
  email: "email", "e-mail": "email", почта: "email", mail: "email", "эл.почта": "email", "электронная почта": "email",
  phone: "phone", телефон: "phone", тел: "phone", "тел.": "phone", номер: "phone", "номер телефона": "phone",
  whatsapp: "whatsapp", вотсап: "whatsapp", ватсап: "whatsapp", wa: "whatsapp", "whats app": "whatsapp",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[+\d][\d\s()\-]{6,}$/;

function classifyByValue(cells: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of cells) {
    const v = raw.trim();
    if (!v) continue;
    if (EMAIL_RE.test(v)) { if (!out.email) out.email = v; }
    else if (PHONE_RE.test(v)) { if (!out.phone) out.phone = v; else if (!out.whatsapp) out.whatsapp = v; }
    else if (!out.name) out.name = v;
  }
  return out;
}

function parseCSV(text: string): Array<Record<string, string>> {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  const delim = detectDelim(firstLine);
  const rows = parseCSVRaw(text, delim);
  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const mapped = header.map(h => HEADER_MAP[h]);
  const hasHeader = mapped.some(Boolean);

  if (hasHeader) {
    return rows.slice(1).map(cells => {
      const rec: Record<string, string> = {};
      mapped.forEach((key, idx) => {
        if (key && cells[idx]) rec[key] = cells[idx].trim();
      });
      return rec;
    }).filter(r => r.email || r.phone || r.whatsapp);
  }

  // No recognizable header — classify each cell by its value.
  return rows.map(classifyByValue).filter(r => r.email || r.phone || r.whatsapp);
}


// ── CSV import modal ────────────────────────────────────────────────────────────
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number; invalid: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(""); setResult(null); setRows([]); setFileName(file.name); setProgress(null);
    try {
      const text = await file.text();
      const totalLines = text.split(/\r?\n/).filter(l => l.trim()).length;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
        setParseError(
          `Файл прочитан (${totalLines} строк), но контакты не распознаны.\n` +
          `Первая строка: "${firstLine.slice(0, 120)}"\n` +
          `Нужна хотя бы одна колонка: email, телефон или whatsapp.`
        );
        return;
      }
      setRows(parsed);
    } catch (err) {
      setParseError("Не удалось прочитать файл: " + (err as Error).message);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress(null);
    try {
      const res = await importLeads(rows, (done, total) => setProgress({ done, total }));
      setResult(res);
      onDone();
    } catch (err) {
      const msg = (err as Error).message ?? "Ошибка импорта";
      setParseError(`Ошибка при отправке на сервер: ${msg}`);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="ad-modal-back" onClick={onClose}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="Импорт контактов из CSV" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-head">
          <h2><Upload aria-hidden="true" /> Импорт контактов из CSV</h2>
          <button type="button" className="ad-icon-btn" onClick={onClose} aria-label="Закрыть"><X aria-hidden="true" /></button>
        </div>

        {result ? (
          <>
            <div className="ad-result">
              <div><span className="ad-muted">Всего строк</span><b>{result.total}</b></div>
              <div><span>Добавлено</span><span className="ad-strong">{result.imported}</span></div>
              <div><span className="ad-muted">Дубликаты (пропущены)</span><b>{result.duplicates}</b></div>
              <div><span className="ad-muted">Без контактов (пропущены)</span><b>{result.invalid}</b></div>
            </div>
            {result.imported === 0 && result.duplicates > 0 && (
              <div className="ad-alert">
                <AlertCircle aria-hidden="true" />
                <span>Все {result.duplicates} записей уже есть в базе (совпадают email или телефон). Если вы удалили их через интерфейс — попробуйте очистить базу через SQL и импортировать заново.</span>
              </div>
            )}
            {result.imported === 0 && result.invalid === result.total && (
              <div className="ad-alert ad-alert--err">
                <AlertCircle aria-hidden="true" />
                <span>Ни одна запись не содержит email, телефон или whatsapp. Проверьте формат файла.</span>
              </div>
            )}
            <button type="button" className="ad-btn ad-btn--block" onClick={onClose}>Готово</button>
          </>
        ) : (
          <>
            <p className="ad-muted ad-small">
              Поддерживаются колонки: <b>name / имя</b>, <b>email / почта</b>, <b>phone / телефон</b>, <b>whatsapp</b>.
              Разделитель определяется автоматически (запятая или точка с запятой). Дубликаты по email или телефону пропускаются.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <button type="button" className="ad-drop" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" />
              <b>{fileName || "Выберите CSV-файл"}</b>
              {rows.length > 0 && <span className="ad-ok">Распознано контактов: {rows.length}</span>}
            </button>

            {parseError && (
              <div className="ad-alert ad-alert--err" role="alert">
                <AlertCircle aria-hidden="true" />
                <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{parseError}</span>
              </div>
            )}

            {importing && progress && (
              <div>
                <div className="ad-prog-meta"><span>Загрузка...</span><span>{progress.done} / {progress.total}</span></div>
                <div className="ad-progress"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
              </div>
            )}

            <button type="button" className="ad-btn ad-btn--block" disabled={rows.length === 0 || importing} onClick={handleImport}>
              {importing
                ? progress
                  ? `Импортирую... ${Math.round((progress.done / progress.total) * 100)}%`
                  : "Импортирую..."
                : rows.length > 0
                  ? `Импортировать ${rows.length}`
                  : "Импортировать"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Table2; text: string }) {
  return (
    <div className="ad-empty">
      <span className="ad-empty-ico"><Icon aria-hidden="true" /></span>
      <p>{text}</p>
    </div>
  );
}

const dash = <span className="ad-muted">—</span>;
const fmtDate = (s: string) => (
  <>
    {new Date(s).toLocaleDateString("ru", { day: "numeric", month: "short" })}<br />
    {new Date(s).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
  </>
);

function LeadsTable({ leads, onOpenChat, onStatusChange, onDelete, onImported }: {
  leads: Lead[];
  onOpenChat: (lead: Lead) => void;
  onStatusChange: (updated: Lead) => void;
  onDelete: (id: string) => void;
  onImported: () => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [sourceTab, setSourceTab] = useState<"all" | "form" | "import">("all");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const PER_PAGE = 20;

  const handleCopy = (lead: Lead) => {
    copyLeadText(lead);
    setCopiedId(lead.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setDeleting(id);
    try {
      await deleteLead(id);
      onDelete(id);
    } catch {} finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const bySource = sourceTab === "all" ? leads
    : leads.filter(l => (l.source ?? "form") === sourceTab);

  const filtered = bySource.filter(l =>
    [l.name, l.email, l.whatsapp ?? "", l.phone ?? "", l.description, l.company ?? "", l.problem ?? ""]
      .join(" ").toLowerCase().includes(filter.toLowerCase())
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  return (
    <div className="ad-pane">
      <div className="ad-toolbar">
        <div className="ad-seg" role="group" aria-label="Источник заявок">
          {([
            { value: "all",    label: `Все (${leads.length})` },
            { value: "form",   label: `С сайта (${leads.filter(l => (l.source ?? "form") === "form").length})` },
            { value: "import", label: `Импорт (${leads.filter(l => l.source === "import").length})` },
          ] as const).map(t => (
            <button
              key={t.value}
              type="button"
              aria-pressed={sourceTab === t.value}
              onClick={() => { setSourceTab(t.value); setPage(0); }}
            >{t.label}</button>
          ))}
        </div>
        <input
          className="ad-input ad-search"
          aria-label="Поиск по заявкам"
          placeholder="Поиск по имени, email, описанию..."
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0); }}
        />
        <span className="ad-count">{filtered.length} из {bySource.length}</span>
        <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setShowImport(true)}>
          <Upload aria-hidden="true" /> Импорт CSV
        </button>
        <div className="ad-stats">
          {STATUS_OPTIONS.map(s => (
            <span key={s.value} className={`ad-chip ad-chip--${s.value}`}>
              {s.label}: {leads.filter(l => l.status === s.value).length}
            </span>
          ))}
        </div>
      </div>
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={onImported} />}

      <div className="ad-tablewrap">
        {filtered.length === 0 ? (
          <Empty icon={Table2} text={leads.length === 0 ? "Заявок пока нет" : "Ничего не найдено"} />
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>#</th><th>Имя</th><th>Email</th><th>Контакт</th><th>Описание</th><th>Статус</th><th>Дата</th>
                <th><span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((lead, i) => (
                <tr key={lead.id}>
                  <td className="ad-muted ad-small">{safePage * PER_PAGE + i + 1}</td>
                  <td className="ad-nowrap" style={{ fontWeight: 700 }}>{lead.name}</td>
                  <td className="ad-nowrap ad-muted">{lead.email}</td>
                  <td className="ad-nowrap ad-muted ad-small">
                    {lead.whatsapp && <div>WA: {lead.whatsapp}</div>}
                    {lead.phone && <div>Тел: {lead.phone}</div>}
                    {!lead.whatsapp && !lead.phone && dash}
                  </td>
                  <td><div className="ad-trunc" title={lead.description}>{lead.company ? `${lead.company}: ` : ""}{lead.description}</div></td>
                  <td className="ad-nowrap">
                    <select
                      aria-label={`Статус заявки ${lead.name}`}
                      value={lead.status}
                      onChange={async e => {
                        try {
                          const updated = await updateLeadStatus(lead.id, e.target.value);
                          onStatusChange(updated);
                        } catch {}
                      }}
                      className={`ad-select ad-select--${statusKey(lead.status)}`}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="ad-nowrap ad-muted ad-small">{fmtDate(lead.createdAt)}</td>
                  <td>
                    <div className="ad-row-actions">
                      <button
                        type="button"
                        onClick={() => handleCopy(lead)}
                        title="Скопировать данные лида"
                        aria-label="Скопировать данные лида"
                        className={`ad-icon-btn ${copiedId === lead.id ? "ad-icon-btn--ok" : ""}`}
                      >
                        {copiedId === lead.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenChat(lead)}
                        title="Открыть чат"
                        aria-label="Открыть чат"
                        className="ad-icon-btn"
                      >
                        <MessageCircle aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(lead.id)}
                        disabled={deleting === lead.id}
                        title={confirmDeleteId === lead.id ? "Нажмите ещё раз: заявка и переписка будут удалены безвозвратно" : "Удалить лид"}
                        aria-label={confirmDeleteId === lead.id ? "Подтвердить безвозвратное удаление заявки и переписки" : "Удалить лид"}
                        className={`ad-icon-btn ad-icon-btn--danger ${confirmDeleteId === lead.id ? "ad-icon-btn--confirm" : ""}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > PER_PAGE && (
        <div className="ad-pager">
          <span className="ad-muted">
            {safePage * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE + PER_PAGE, filtered.length)} из {filtered.length}
          </span>
          <div>
            <button type="button" className="ad-btn ad-btn--ghost" aria-label="Первая страница" onClick={() => setPage(0)} disabled={safePage === 0}>«</button>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>Назад</button>
            <span className="ad-muted">Стр. {safePage + 1} из {pageCount}</span>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Вперёд</button>
            <button type="button" className="ad-btn ad-btn--ghost" aria-label="Последняя страница" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics table ───────────────────────────────────────────────────────────
function AnalyticsTable({ leads }: { leads: Lead[] }) {
  const [filter, setFilter] = useState("");

  const filtered = leads.filter(l =>
    [l.name, l.country ?? "", l.city ?? "", l.ip ?? "", l.browser ?? "", l.os ?? "", l.referrer ?? "", l.utmSource ?? "", l.utmCampaign ?? ""]
      .join(" ").toLowerCase().includes(filter.toLowerCase())
  );

  const DeviceIcon = (device: string | null | undefined) =>
    device === "mobile" ? <Smartphone aria-hidden="true" width={14} height={14} /> :
    device === "tablet" ? <Tablet aria-hidden="true" width={14} height={14} /> :
    <Monitor aria-hidden="true" width={14} height={14} />;

  return (
    <div className="ad-pane">
      <div className="ad-toolbar">
        <input
          className="ad-input ad-search"
          aria-label="Поиск по аналитике"
          placeholder="Поиск по стране, IP, браузеру..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="ad-count">{filtered.length} из {leads.length}</span>
        <div className="ad-stats">
          <span className="ad-chip"><Monitor aria-hidden="true" width={13} height={13} style={{ marginRight: 5 }} /> Desktop: {leads.filter(l => l.device === "desktop" || !l.device).length}</span>
          <span className="ad-chip"><Smartphone aria-hidden="true" width={13} height={13} style={{ marginRight: 5 }} /> Mobile: {leads.filter(l => l.device === "mobile").length}</span>
          <span className="ad-chip"><Tablet aria-hidden="true" width={13} height={13} style={{ marginRight: 5 }} /> Tablet: {leads.filter(l => l.device === "tablet").length}</span>
        </div>
      </div>

      <div className="ad-tablewrap">
        {filtered.length === 0 ? (
          <Empty icon={BarChart2} text={leads.length === 0 ? "Нет данных" : "Ничего не найдено"} />
        ) : (
          <table className="ad-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>#</th><th>Имя</th><th>Геолокация</th><th>IP</th><th>Устройство</th><th>Браузер / ОС</th><th>Язык</th><th>UTM</th><th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => (
                <tr key={lead.id}>
                  <td className="ad-muted ad-small">{i + 1}</td>
                  <td className="ad-nowrap">
                    <div style={{ fontWeight: 700 }}>{lead.name}</div>
                    <div className="ad-muted ad-small">{lead.email}</div>
                  </td>
                  <td className="ad-nowrap ad-small">
                    {(lead.country || lead.city) ? (
                      <span>
                        {[lead.city, lead.country].filter(Boolean).join(", ")}
                        {lead.countryCode && <span className="ad-muted"> ({lead.countryCode})</span>}
                      </span>
                    ) : dash}
                  </td>
                  <td>{lead.ip ? <span className="ad-mono ad-muted">{lead.ip}</span> : dash}</td>
                  <td className="ad-small">
                    {lead.device ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, textTransform: "capitalize" }}>
                        {DeviceIcon(lead.device)}{lead.device}
                      </span>
                    ) : dash}
                  </td>
                  <td className="ad-nowrap ad-small">
                    {lead.browser || lead.os ? (
                      <div>
                        {lead.browser && <div>{lead.browser}</div>}
                        {lead.os && <div className="ad-muted">{lead.os}</div>}
                      </div>
                    ) : dash}
                  </td>
                  <td>{lead.language ? <span className="ad-chip" style={{ textTransform: "uppercase" }}>{lead.language}</span> : dash}</td>
                  <td className="ad-nowrap">
                    {(lead.utmSource || lead.utmMedium || lead.utmCampaign) ? (
                      <div className="ad-utm" style={{ flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                        {lead.utmSource && <span>src: {lead.utmSource}</span>}
                        {lead.utmMedium && <span>med: {lead.utmMedium}</span>}
                        {lead.utmCampaign && <span>camp: {lead.utmCampaign}</span>}
                      </div>
                    ) : dash}
                  </td>
                  <td className="ad-nowrap ad-muted ad-small">{fmtDate(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main admin panel ──────────────────────────────────────────────────────────
export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [tab, setTab] = useState<"chat" | "table" | "analytics">("chat");
  const [chatSearch, setChatSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const formLeads = leads.filter(l => (l.source ?? "form") !== "import");
  const [unseenNewLeads, setUnseenNewLeads] = useState(0);
  const knownLeadIds = useRef(new Set<string>());
  const leadsInitialized = useRef(false);

  useEffect(() => {
    adminMe().then(() => setAuthed(true)).catch(() => setAuthed(false));
    requestNotifPermission();
    const onUnauth = () => setAuthed(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, []);

  const loadLeads = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try { setLeads(await getLeads()); } catch {} finally { if (showSpinner) setLoading(false); }
  };

  useEffect(() => {
    if (!authed) return;
    const poll = async () => {
      try {
        const fresh = await getLeads();
        if (leadsInitialized.current) {
          const newOnes = fresh.filter(
            l => !knownLeadIds.current.has(l.id) && l.status === "new"
          );
          if (newOnes.length > 0) {
            setUnseenNewLeads(n => n + newOnes.length);
            playLeadSound();
            showBrowserNotif(
              "Новая заявка — BROKER CHECK",
              `${newOnes[0].name}: ${newOnes[0].description.slice(0, 80)}`
            );
          }
        }
        fresh.forEach(l => knownLeadIds.current.add(l.id));
        leadsInitialized.current = true;
        setLeads(fresh);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [authed]);

  const handleLogout = async () => {
    await adminLogout().catch(() => {});
    setAuthed(false);
  };

  const handleStatusChange = (updated: Lead) => {
    setLeads(ls => ls.map(l => l.id === updated.id ? updated : l));
    if (selected?.id === updated.id) setSelected(updated);
  };

  const openChat = (lead: Lead) => {
    setSelected(lead);
    setTab("chat");
  };

  if (authed === null) return (
    <div className="ad-root admin-root ad-root--center">
      <div className="ad-skel" aria-busy="true" aria-label="Загрузка"><span /><span /><span /></div>
    </div>
  );

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  const q = chatSearch.trim().toLowerCase();
  const matches = q
    ? formLeads.filter(l => [l.name, l.email, l.whatsapp ?? "", l.phone ?? "", l.description, l.company ?? "", l.problem ?? ""].join(" ").toLowerCase().includes(q))
    : formLeads;
  const CHAT_LIMIT = 50;
  const shown = matches.slice(0, CHAT_LIMIT);

  return (
    <div className="ad-root admin-root" onClick={primeAudio}>
      <header className="ad-header">
        <AdminLogo tag="Админ" />
        <div className="ad-tabs" role="tablist" aria-label="Разделы">
          <button type="button" role="tab" aria-selected={tab === "chat"} className="ad-tab" onClick={() => setTab("chat")}>
            <MessageCircle aria-hidden="true" /> Чат
          </button>
          <button type="button" role="tab" aria-selected={tab === "table"} className="ad-tab" onClick={() => { setTab("table"); setUnseenNewLeads(0); }}>
            <Table2 aria-hidden="true" /> Таблица
            {unseenNewLeads > 0 && <span className="ad-badge-count" aria-label={`Новых заявок: ${unseenNewLeads}`}>{unseenNewLeads}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === "analytics"} className="ad-tab" onClick={() => setTab("analytics")}>
            <BarChart2 aria-hidden="true" /> Аналитика
          </button>
        </div>
        <div className="ad-head-actions">
          <button type="button" className="ad-icon-btn" onClick={() => loadLeads()} title="Обновить" aria-label="Обновить">
            <RefreshCw aria-hidden="true" className={loading ? "ad-spin" : ""} />
          </button>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={handleLogout}>
            <LogOut aria-hidden="true" /> Выйти
          </button>
        </div>
      </header>

      <div className="ad-body" data-selected={selected ? "true" : "false"} style={tab === "chat" ? undefined : { display: "flex" }}>
        {tab === "analytics" ? (
          <TrafficDashboard />
        ) : tab === "table" ? (
          <LeadsTable
            leads={leads}
            onOpenChat={openChat}
            onStatusChange={handleStatusChange}
            onDelete={id => setLeads(ls => ls.filter(l => l.id !== id))}
            onImported={() => loadLeads(false)}
          />
        ) : (
          <>
            <aside className="ad-aside" aria-label="Список заявок">
              <div className="ad-aside-head">
                <div className="ad-aside-title">Заявки с сайта <span>({formLeads.length})</span></div>
                <input
                  className="ad-input"
                  aria-label="Поиск по заявкам"
                  placeholder="Поиск..."
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                />
              </div>
              <div className="ad-aside-list">
                {formLeads.length === 0 && <p className="ad-note">Заявок пока нет</p>}
                {formLeads.length > 0 && matches.length === 0 && <p className="ad-note">Ничего не найдено</p>}
                {shown.map(lead => (
                  <button
                    type="button"
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    aria-current={selected?.id === lead.id}
                    className="ad-lead"
                  >
                    <div className="ad-lead-top">
                      <div style={{ minWidth: 0 }}>
                        <div className="ad-lead-name">{lead.name}</div>
                        <div className="ad-lead-sub">{lead.email}</div>
                        <div className="ad-lead-sub">{lead.description.slice(0, 60)}…</div>
                      </div>
                      <span className={`ad-chip ad-chip--${statusKey(lead.status)}`}>{statusLabel(lead.status)}</span>
                    </div>
                    <div className="ad-lead-date">
                      {new Date(lead.createdAt).toLocaleDateString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                ))}
                {matches.length > CHAT_LIMIT && (
                  <p className="ad-note">Показаны первые {CHAT_LIMIT} из {matches.length}. Уточните поиск.</p>
                )}
              </div>
            </aside>

            <main className="ad-chat-main">
              {selected ? (
                <ChatPanel
                  key={selected.id}
                  lead={selected}
                  onStatusChange={handleStatusChange}
                  onBack={() => setSelected(null)}
                />
              ) : (
                <Empty icon={MessageSquare} text="Выберите заявку из списка слева" />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
