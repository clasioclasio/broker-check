import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { PHONE_COUNTRIES, callingCode, formatNational, type PhoneCountry } from '@/lib/phone';
import { createReportRequest } from '@/lib/report-request';
import { ClientMessages } from '@/components/client-messages';
import { useReportRequest } from '@/components/report-request-provider';

export function focusReportRequest() {
  const target = document.getElementById('report-request-form') ?? document.getElementById('consultation');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    const input = document.getElementById('rr-name') ?? document.getElementById('rr-success-title');
    input?.focus({ preventScroll: true });
  }, 350);
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="mt-2 text-base font-medium text-destructive" role="alert">{msg}</p> : null;
}
function Lbl({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-base font-semibold text-primary">{children} <span className="text-destructive" aria-label="обязательное поле">*</span></label>;
}

export function ReportRequestSection({ reportId, company }: { reportId: string; company: string }) {
  const { draft, patch, setPhone, submit, restart, pendingId, failedId } = useReportRequest();
  const d = draft(reportId);
  const pending = pendingId === reportId;
  const failed = failedId === reportId;
  const E = d.errors;
  const inv = (f: keyof typeof E) => (E[f] ? true : undefined);
  const dsc = (f: keyof typeof E) => (E[f] ? `rr-${f}-err` : undefined);
  const upd = (p: Partial<typeof d>, f?: keyof typeof E) => patch(reportId, f ? { ...p, errors: { ...E, [f]: undefined } } : p);

  return (
    <section id="consultation" className="ink scroll-mt-48" data-testid="section-report-request" aria-labelledby="rr-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div className="min-w-0">
          <h2 id="rr-title" className="hd text-3xl text-primary sm:text-4xl">Заявка на подробный отчёт</h2>
          <p className="prose-ru mt-5 text-lg text-foreground">Заявка уже подготовлена. Укажите только имя, почту и номер WhatsApp. Специалист рассмотрит обращение и вручную направит подготовленный отчёт в WhatsApp.</p>
          <p className="mt-4 max-w-md text-base leading-relaxed text-foreground">Автоматической отправки нет. Срок зависит от рассмотрения и не гарантируется.</p>
        </div>
        <div id="report-request-form" className="min-w-0 scroll-mt-48 rounded-lg bg-background shadow-sm ring-1 ring-border">
          {d.receipt ? (
            <div className="p-6 sm:p-10" role="status" aria-live="polite" data-testid="status-report-request-success">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-accent"><Check className="h-8 w-8" /></span>
              <h3 id="rr-success-title" tabIndex={-1} className="hd mt-6 text-2xl text-primary sm:text-3xl">Заявка принята на рассмотрение</h3>
              <p className="mt-4 text-lg leading-relaxed text-foreground">Специалист рассмотрит обращение и направит подготовленный отчёт в WhatsApp на указанный номер. Ожидайте отчёт в WhatsApp.</p>
              <p className="mt-3 text-base text-muted-foreground">Срок зависит от рассмотрения. Номер заявки: <span className="font-mono" data-testid="text-report-request-id">{d.receipt.id}</span></p>
              <button type="button" onClick={() => restart(reportId)} className="hard-btn mt-8 h-14 bg-primary px-6 text-lg font-semibold text-primary-foreground" data-testid="button-new-report-request">Новая заявка</button>
              <ClientMessages />
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submit(reportId, company); }} noValidate className="p-5 sm:p-10" data-testid="form-report-request">
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={d.website} onChange={(e) => upd({ website: e.target.value })} /></label>
              </div>
              <div className="grid gap-6">
                <div>
                  <label htmlFor="rr-company" className="mb-2 block text-base font-semibold text-primary">Компания или брокер</label>
                  <input id="rr-company" readOnly className="fld bg-secondary/60" value={company} data-testid="input-report-company" />
                </div>
                <div>
                  <label htmlFor="rr-text" className="mb-2 block text-base font-semibold text-primary">Подготовленная заявка</label>
                  <textarea id="rr-text" readOnly className="fld bg-secondary/60" rows={5} value={createReportRequest(company)} data-testid="input-report-text" />
                </div>
                <div>
                  <Lbl htmlFor="rr-name">Имя</Lbl>
                  <input id="rr-name" className="fld" value={d.name} maxLength={100} autoComplete="name" onChange={(e) => upd({ name: e.target.value }, 'name')} aria-invalid={inv('name')} aria-describedby={dsc('name')} aria-required="true" data-testid="input-name" />
                  <Err id="rr-name-err" msg={E.name} />
                </div>
                <div>
                  <Lbl htmlFor="rr-email">Эл. почта</Lbl>
                  <input id="rr-email" type="email" className="fld" value={d.email} maxLength={254} autoComplete="email" placeholder="name@mail.com" onChange={(e) => upd({ email: e.target.value }, 'email')} aria-invalid={inv('email')} aria-describedby={dsc('email')} aria-required="true" data-testid="input-email" />
                  <Err id="rr-email-err" msg={E.email} />
                </div>
                <div>
                  <Lbl htmlFor="rr-phone">Номер WhatsApp</Lbl>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-2">
                    <select aria-label="Страна" className="fld col-span-2 px-2" value={d.country} onChange={(e) => upd({ country: e.target.value as PhoneCountry, digits: '' }, 'phone')} data-testid="select-phone-country">
                      {PHONE_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label} ({callingCode(c.id)})</option>)}
                    </select>
                    <span className="grid place-items-center rounded-md bg-primary px-3 font-mono text-base font-bold text-primary-foreground" aria-hidden="true">{callingCode(d.country)}</span>
                    <input id="rr-phone" type="tel" inputMode="tel" className="fld" placeholder="Номер телефона" aria-label={`Номер WhatsApp, код страны ${callingCode(d.country)}`} value={formatNational(d.digits, d.country)} onChange={(e) => setPhone(reportId, e.target.value)} autoComplete="tel-national" aria-invalid={inv('phone')} aria-describedby={dsc('phone')} aria-required="true" data-testid="input-phone" />
                  </div>
                  <Err id="rr-phone-err" msg={E.phone} />
                </div>
              </div>
              {failed && (
                <div className="mt-5 flex items-start gap-3 rounded-md border border-destructive bg-destructive/5 p-3 text-base" role="alert" data-testid="status-report-request-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p>Не удалось отправить заявку. Введённые данные сохранены. Повторите отправку: дубликат не создаётся.</p>
                </div>
              )}
              <button type="submit" disabled={pending} aria-describedby="rr-submit-notice" className="hard-btn mt-6 flex h-14 w-full items-center justify-between bg-accent px-6 text-lg font-semibold text-accent-foreground disabled:opacity-60" data-testid="button-submit-report-request">
                <span>{pending ? 'Отправляем…' : failed ? 'Повторить отправку' : 'Отправить заявку'}</span>
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <span aria-hidden="true">→</span>}
              </button>
              <p id="rr-submit-notice" className="mt-3 text-base leading-relaxed text-muted-foreground">
                Отправляя заявку, вы разрешаете использовать указанные данные для рассмотрения обращения и отправки отчёта в WhatsApp.
              </p>
              <p className="mt-4 text-base text-muted-foreground">Принимаются номера всех стран. Выберите страну и введите номер; также можно вставить полный номер с её международным кодом.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
