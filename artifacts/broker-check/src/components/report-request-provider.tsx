import { flushTraffic, trackTraffic } from '@/lib/traffic-tracker';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useCreateConsultation } from '@workspace/api-client-react';
import type { ConsultationReceipt } from '@workspace/api-client-react';
import { createReportRequest } from '@/lib/report-request';
import { extractNational, phoneError, validatePhone, type PhoneCountry } from '@/lib/phone';
import { isDuplicateSubmission, useSubmissionLock } from '@/lib/submission-lock';

export type Field = 'name' | 'email' | 'phone';
export type Errors = Partial<Record<Field, string>>;
export interface Draft { name: string; email: string; country: PhoneCountry; digits: string; website: string; key: string; receipt: ConsultationReceipt | null; errors: Errors }
const fresh = (): Draft => ({ name: '', email: '', country: 'US', digits: '', website: '', key: crypto.randomUUID(), receipt: null, errors: {} });

interface Ctx {
  draft: (id: string) => Draft;
  patch: (id: string, p: Partial<Draft>) => void;
  setPhone: (id: string, raw: string) => void;
  submit: (id: string, company: string) => void;
  submitted: boolean;
  checking: boolean;
  pendingId: string | null;
  failedId: string | null;
}
const C = createContext<Ctx | null>(null);
export const useReportRequest = () => { const c = useContext(C); if (!c) throw new Error('ReportRequestProvider missing'); return c; };

export function ReportRequestProvider({ children }: { children: ReactNode }) {
  const submission = useSubmissionLock();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const busy = useRef(false);
  const draftsRef = useRef(drafts); draftsRef.current = drafts;
  const mutation = useCreateConsultation();
  const mutate = useRef(mutation.mutate); mutate.current = mutation.mutate;

  const draft = useCallback((id: string) => drafts[id] ?? fresh(), [drafts]);
  const patch = useCallback((id: string, p: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? fresh()), ...p } }));
  }, []);
  const setPhone = useCallback((id: string, raw: string) => {
    setDrafts((d) => { const c = d[id] ?? fresh(); return { ...d, [id]: { ...c, digits: extractNational(raw, c.country), errors: { ...c.errors, phone: undefined } } }; });
  }, []);

  const submit = useCallback((id: string, company: string) => {
    if (busy.current || submission.submitted || submission.checking) return;
    const d = draftsRef.current[id] ?? fresh();
    const phone = validatePhone(d.digits, d.country);
    const errors: Errors = {};
    if (d.name.trim().length < 2) errors.name = 'Укажите имя: не короче 2 символов';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim()) || d.email.length > 254) errors.email = 'Введите корректный адрес, например name@mail.com';
    if (!phone) errors.phone = phoneError(d.country);
    patch(id, { errors });
    if (Object.keys(errors).length) trackTraffic('form_error');
    const first = (['name', 'email', 'phone'] as Field[]).find((f) => errors[f]);
    if (first || !phone) {
      if (first) window.setTimeout(() => document.getElementById(`rr-${first}`)?.focus(), 0);
      return;
    }
    busy.current = true; setPendingId(id); setFailedId(null);
    void flushTraffic().finally(() => mutate.current(
      // The submit action follows the visible consent notice below the button.
      { data: { name: d.name.trim(), email: d.email.trim(), phone, company, problem: 'other', description: createReportRequest(company), consent: true, idempotencyKey: d.key, website: d.website } },
      {
        onSuccess: (receipt) => { patch(id, { receipt }); submission.lock(); },
        onError: (error) => {
          if (isDuplicateSubmission(error)) { submission.lock(); return; }
          setFailedId(id); window.setTimeout(() => document.getElementById('rr-name')?.focus(), 0);
        },
        onSettled: () => { busy.current = false; setPendingId(null); },
      },
    ));
  }, [patch, submission.submitted, submission.checking, submission.lock]);

  return <C.Provider value={{ draft, patch, setPhone, submit, submitted: submission.submitted, checking: submission.checking, pendingId, failedId }}>{children}</C.Provider>;
}
