import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useCreateConsultation } from '@workspace/api-client-react';
import type { ConsultationInput } from '@workspace/api-client-react';
import { Eyebrow } from '@/components/guides';
import { ClientMessages } from '@/components/client-messages';
import { flushTraffic, trackTraffic } from '@/lib/traffic-tracker';
import { saveCompany } from '@/lib/company';
import { PHONE_COUNTRIES, callingCode, extractNational, formatNational, phoneError, validatePhone, type PhoneCountry } from '@/lib/phone';

type Problem = ConsultationInput['problem'];

const PROBLEMS: { value: Problem; label: string }[] = [
  { value: 'withdrawal', label: 'Не получается вывести средства' },
  { value: 'blocked', label: 'Счет или личный кабинет заблокирован' },
  { value: 'payments', label: 'Компания требует дополнительные платежи' },
  { value: 'no_response', label: 'Представители компании перестали отвечать' },
  { value: 'license', label: 'Возникли сомнения в лицензии' },
  { value: 'before_cooperation', label: 'Хочу проверить компанию перед сотрудничеством' },
  { value: 'other', label: 'Другая ситуация' },
];

type Field = 'name' | 'phone' | 'email' | 'company' | 'problem';
type Errors = Partial<Record<Field, string>>;
const ORDER: Field[] = ['name', 'email', 'phone', 'company', 'problem'];
const FIELD_ID: Record<Field, string> = { name: 'cf-name', email: 'cf-email', phone: 'cf-phone', company: 'cf-company', problem: 'cf-problem' };

interface Ctx {
  open: (prefillCompany?: string) => void;
  s: {
    company: string; name: string; email: string; country: PhoneCountry; digits: string; problem: Problem | ''; description: string;
    website: string; errors: Errors; done: boolean; pending: boolean; failed: boolean;
  };
  set: {
    company: (v: string) => void; name: (v: string) => void; email: (v: string) => void; country: (v: PhoneCountry) => void;
    phone: (v: string) => void; problem: (v: Problem | '') => void; description: (v: string) => void;
    website: (v: string) => void;
  };
  submit: (e: React.FormEvent) => void;
  restart: () => void;
}
const ConsultationContext = createContext<Ctx | null>(null);

export const useConsultation = () => {
  const c = useContext(ConsultationContext);
  if (!c) throw new Error('ConsultationProvider missing');
  return c;
};

export function ConsultationProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState<PhoneCountry>('US');
  const [digits, setDigits] = useState('');
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<Problem | ''>('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const keyRef = useRef<string>(crypto.randomUUID());
  const submitting = useRef(false);
  const mutation = useCreateConsultation();
  const resetMutation = mutation.reset;

  const clear = (f: Field) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));

  const open = useCallback((prefill?: string) => {
    if (prefill) setCompany(prefill);
    const el = document.getElementById('consultation');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('cf-name')?.focus({ preventScroll: true });
  }, []);

  const restart = useCallback(() => {
    setName(''); setDigits(''); setEmail(''); setProblem(''); setDescription(''); setWebsite('');
    setErrors({}); setDone(false);
    resetMutation();
    keyRef.current = crypto.randomUUID();
  }, [resetMutation]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || mutation.isPending) return;
    const phone = validatePhone(digits, country);
    const errs: Errors = {};
    if (name.trim().length < 2) errs.name = 'Укажите имя: не короче 2 символов';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) || email.length > 254) errs.email = 'Введите корректный адрес, например name@mail.com';
    if (!phone) errs.phone = phoneError(country);
    if (company.trim().length < 2) errs.company = 'Укажите название брокера: не короче 2 символов';
    if (!problem) errs.problem = 'Выберите, с чем вы столкнулись';
    setErrors(errs);
    if (Object.keys(errs).length) trackTraffic('form_error');
    const first = ORDER.find((f) => errs[f]);
    if (first || !problem || !phone) {
      if (first) window.setTimeout(() => document.getElementById(FIELD_ID[first])?.focus(), 0);
      return;
    }

    submitting.current = true;
    void flushTraffic().finally(() => mutation.mutate(
      {
        data: {
          name: name.trim(),
          phone,
          email: email.trim(),
          company: company.trim(),
          problem,
          description: description.trim() || undefined,
          consent: true,
          idempotencyKey: keyRef.current,
          website,
        },
      },
      {
        onSuccess: () => { saveCompany(company.trim()); setDone(true); },
        onSettled: () => { submitting.current = false; },
      },
    ));
  };

  const value: Ctx = {
    open,
    s: { company, name, email, country, digits, problem, description, website, errors, done, pending: mutation.isPending, failed: mutation.isError },
    set: {
      company: (v) => { setCompany(v); clear('company'); },
      name: (v) => { setName(v); clear('name'); },
      email: (v) => { setEmail(v); clear('email'); },
      country: (v) => { setCountry(v); setDigits(''); clear('phone'); },
      phone: (v) => { setDigits(extractNational(v, country)); clear('phone'); },
      problem: (v) => { setProblem(v); clear('problem'); },
      description: setDescription,
      website: setWebsite,
    },
    submit,
    restart,
  };
  // open is stable; the rest changes with the draft
  const ctx = useMemo(() => value, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return <ConsultationContext.Provider value={ctx}>{children}</ConsultationContext.Provider>;
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="mt-2 text-base font-medium text-destructive" role="alert">{msg}</p> : null;
}

function Lbl({ htmlFor, n, children, optional }: { htmlFor: string; n: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-baseline gap-2 text-base font-semibold text-primary">
      <span>{children}</span>
      {optional ? <span className="text-sm font-normal text-muted-foreground">необязательно</span> : <span className="text-destructive" aria-label="обязательное поле">*</span>}
    </label>
  );
}

export function ConsultationSection({ company: prefill }: { company?: string }) {
  const { s, set, submit, restart } = useConsultation();
  const applied = useRef('');
  const setCompanyRef = useRef(set.company);
  setCompanyRef.current = set.company;
  useEffect(() => {
    if (prefill && applied.current !== prefill) {
      applied.current = prefill;
      if (!s.company) setCompanyRef.current(prefill);
    }
  }, [prefill, s.company]);

  const E = s.errors;
  const inv = (f: Field) => (E[f] ? true : undefined);
  const desc = (f: Field) => (E[f] ? `${FIELD_ID[f]}-err` : undefined);

  return (
    <section id="consultation" className="ink relative overflow-hidden" data-testid="section-consultation" aria-labelledby="consultation-title">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div className="min-w-0 lg:sticky lg:top-32 lg:self-start">
          <Eyebrow dark>Запрос специалисту</Eyebrow>
          <h2 id="consultation-title" className="hd text-3xl text-primary sm:text-4xl md:text-5xl">Разберём <span className="stroke-gold">вашу</span> ситуацию</h2>
          <p className="prose-ru mt-6 text-lg text-foreground">
            Опишите, что произошло. Специалист изучит обстоятельства обращения. Результат в споре зависит от документов и юрисдикции, возврата средств мы не обещаем.
          </p>
        </div>

        <div className="min-w-0 rounded-lg bg-background text-foreground shadow-sm ring-1 ring-border">
          {s.done ? (
            <div className="p-6 sm:p-10" data-testid="status-consultation-success" role="status" aria-live="polite">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-accent"><Check className="h-8 w-8" /></span>
              <h3 className="hd mt-6 text-3xl text-primary sm:text-4xl">Запрос сохранён</h3>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Ваш запрос успешно отправлен. Специалист свяжется с вами по указанным контактным данным.</p>
              <p className="mt-3 rounded-md bg-secondary/70 p-3 text-base leading-relaxed text-muted-foreground">Запрос записан в базу данных платформы. Автоматических уведомлений на почту эта форма не отправляет; срок ответа не гарантируется.</p>
              <button type="button" onClick={restart} className="hard-btn mt-8 h-12 bg-primary px-6 text-lg font-semibold text-primary-foreground" data-testid="button-new-request">Отправить новый запрос</button>
              <ClientMessages />
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="p-5 sm:p-10" data-testid="form-consultation">
              <div className="mb-8 flex items-end justify-between gap-4 border-b border-border pb-4">
                <h3 className="hd text-2xl text-primary sm:text-3xl">Запрос на дополнительную проверку</h3>
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">* обязательно</span>
              </div>
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={s.website} onChange={(e) => set.website(e.target.value)} /></label>
              </div>

              <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
                <div className="min-w-0">
                  <Lbl htmlFor="cf-name" n="01">Имя</Lbl>
                  <input id="cf-name" className="fld" value={s.name} onChange={(e) => set.name(e.target.value)} maxLength={100} autoComplete="name" placeholder="Как к вам обращаться" aria-invalid={inv('name')} aria-describedby={desc('name')} aria-required="true" data-testid="input-name" />
                  <Err id="cf-name-err" msg={E.name} />
                </div>
                <div className="min-w-0">
                  <Lbl htmlFor="cf-email" n="02">Эл. почта</Lbl>
                  <input id="cf-email" type="email" className="fld" value={s.email} onChange={(e) => set.email(e.target.value)} maxLength={254} autoComplete="email" placeholder="name@mail.com" aria-invalid={inv('email')} aria-describedby={desc('email')} aria-required="true" data-testid="input-email" />
                  <Err id="cf-email-err" msg={E.email} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Lbl htmlFor="cf-phone" n="03">Телефон</Lbl>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-2">
                    <select aria-label="Страна" className="fld col-span-2 px-2" value={s.country} onChange={(e) => set.country(e.target.value as PhoneCountry)} data-testid="select-phone-country">
                      {PHONE_COUNTRIES.map((c) => (<option key={c.id} value={c.id}>{c.label} ({callingCode(c.id)})</option>))}
                    </select>
                    <span className="grid place-items-center rounded-md bg-primary px-3 font-mono text-base font-bold text-primary-foreground" aria-hidden="true">{callingCode(s.country)}</span>
                    <input id="cf-phone" type="tel" inputMode="tel" className="fld" placeholder="Номер телефона" aria-label={`Телефон, код страны ${callingCode(s.country)}`} value={formatNational(s.digits, s.country)} onChange={(e) => set.phone(e.target.value)} autoComplete="tel-national" aria-invalid={inv('phone')} aria-describedby={desc('phone')} aria-required="true" data-testid="input-phone" />
                  </div>
                  <Err id="cf-phone-err" msg={E.phone} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Lbl htmlFor="cf-company" n="04">Брокер или компания</Lbl>
                  <input id="cf-company" className="fld" value={s.company} onChange={(e) => set.company(e.target.value)} maxLength={200} placeholder="Название или адрес сайта" aria-invalid={inv('company')} aria-describedby={desc('company')} aria-required="true" data-testid="input-company" />
                  <Err id="cf-company-err" msg={E.company} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Lbl htmlFor="cf-problem" n="05">С чем вы столкнулись</Lbl>
                  <select id="cf-problem" className="fld" value={s.problem} onChange={(e) => set.problem(e.target.value as Problem)} aria-invalid={inv('problem')} aria-describedby={desc('problem')} aria-required="true" data-testid="select-problem">
                    <option value="" disabled>Выберите вариант</option>
                    {PROBLEMS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                  </select>
                  <Err id="cf-problem-err" msg={E.problem} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Lbl htmlFor="cf-desc" n="06" optional>Описание</Lbl>
                  <textarea id="cf-desc" className="fld" value={s.description} onChange={(e) => set.description(e.target.value)} maxLength={5000} placeholder="Когда начались проблемы, какие суммы и способы перевода, что ответила компания" aria-describedby="cf-desc-count" data-testid="input-description" />
                  <p id="cf-desc-count" className="mt-1 text-right font-mono text-sm text-muted-foreground">{s.description.length} / 5000</p>
                </div>
              </div>

              {s.failed && (
                <div className="mt-5 flex items-start gap-3 rounded-md border border-destructive bg-destructive/5 p-3 text-base" role="alert" data-testid="status-consultation-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p>Не удалось отправить запрос. Введённые данные сохранены. Проверьте соединение и повторите: повторная отправка не создаст дубликат.</p>
                </div>
              )}

              <button type="submit" disabled={s.pending} className="hard-btn mt-6 flex h-14 w-full items-center justify-between bg-accent px-6 text-base font-semibold text-accent-foreground disabled:opacity-60" data-testid="button-submit-consultation">
                <span>{s.pending ? 'Отправляем…' : s.failed ? 'Повторить отправку' : 'Отправить запрос'}</span>
                {s.pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <span aria-hidden="true">→</span>}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
