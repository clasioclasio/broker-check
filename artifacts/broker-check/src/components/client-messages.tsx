import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Link } from 'wouter';
import { ApiError, getMessages, getMyLead, sendMessage, type Message } from '@/lib/admin-api';

export function ClientMessages() {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const unavailable = useRef(false);

  const load = useCallback(async (id: string) => {
    try {
      const received = await getMessages(id);
      if (!unavailable.current) { setMessages(received); setError(''); }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        unavailable.current = true;
        clearInterval(pollRef.current);
        setMessages([]); setLeadId(null); setText('');
        setError('Заявка удалена или доступ к переписке завершён.');
      } else {
        setError('Не удалось обновить сообщения. Повторим попытку автоматически.');
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lead = await getMyLead();
        if (!alive) return;
        setLeadId(lead.id);
        await load(lead.id);
        if (alive && !unavailable.current) pollRef.current = setInterval(() => { void load(lead.id); }, 5000);
      } catch {
        if (alive) setError('Чат на сайте пока недоступен для этого устройства. Специалист свяжется с вами по указанным контактам.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !leadId || sending) return;
    setSending(true);
    try { const m = await sendMessage(leadId, t); setMessages((x) => [...x, m]); setText(''); setError(''); }
    catch { setError('Сообщение не отправлено. Проверьте соединение и повторите.'); }
    finally { setSending(false); }
  };

  return (
    <div className="mt-8 rounded-md bg-secondary/50 p-4 text-left" data-testid="client-messages">
      <h4 className="text-lg font-semibold text-primary">Сообщения на сайте</h4>
      <p className="mt-1 text-base text-muted-foreground">Это переписка внутри сайта, а не доставка в WhatsApp. Ответ специалиста появится здесь, пока вы открываете эту страницу в этом браузере.</p>
      <Link href="/messages" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Ссылка для возврата к переписке</Link>
      {loading ? <p className="mt-3 text-base text-muted-foreground">Загружаем переписку…</p> : (
        <>
          {leadId && (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-md bg-background p-3 ring-1 ring-border" aria-live="polite">
              {messages.length === 0 && <p className="text-base text-muted-foreground">Сообщений пока нет.</p>}
              {messages.map((m) => (
                <div key={m.id} className={m.sender === 'manager' ? 'text-left' : 'text-right'}>
                  <span className="block text-sm text-muted-foreground">{m.sender === 'manager' ? 'Специалист' : 'Вы'} · {new Date(m.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-md bg-secondary px-3 py-2 text-base">{m.text}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          {error && <p className="mt-3 text-base font-medium text-destructive" role="alert">{error}</p>}
          {leadId && (
            <div className="mt-3 flex items-end gap-2">
              <textarea className="fld min-h-[3rem] min-w-0 flex-1" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Сообщение специалисту" placeholder="Напишите сообщение" data-testid="input-client-message" />
              <button type="button" onClick={send} disabled={sending || !text.trim()} className="hard-btn grid h-12 w-12 shrink-0 place-items-center self-end bg-primary text-primary-foreground disabled:opacity-60" aria-label="Отправить сообщение" data-testid="button-send-client-message">
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
