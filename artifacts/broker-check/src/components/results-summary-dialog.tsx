import { useEffect, useRef, useState } from 'react';
import { HelpCircle, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { focusReportRequest } from '@/components/report-request-section';
import { getNeutralReportText } from '@/lib/report-request';

const QUESTIONS = [
  'Есть ли у компании лицензия и в каком реестре её искать',
  'На каких условиях возможен вывод средств',
  'Нет ли требований дополнительных платежей в договоре',
];

export function ResultsSummaryDialog({ reportId, company }: { reportId: string; company: string }) {
  const [open, setOpen] = useState(false);
  const seen = useRef<string | null>(null);
  const reopenButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const continueToForm = useRef(false);
  useEffect(() => {
    if (seen.current === reportId) return;
    seen.current = reportId;
    const u = new URL(window.location.href);
    if (u.searchParams.get('summary') === '1') {
      setOpen(true);
      u.searchParams.delete('summary');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    }
  }, [reportId]);

  const go = () => {
    continueToForm.current = true;
    setOpen(false);
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <button ref={reopenButton} type="button" onClick={() => setOpen(true)} className="hard-btn min-h-12 border border-primary px-5 text-base font-semibold text-primary" data-testid="button-reopen-summary">Показать краткий итог</button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[calc(100%_-_1.5rem)] max-h-[85dvh] max-w-xl overscroll-contain sm:w-[calc(100%_-_2rem)] grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg p-0"
          onOpenAutoFocus={(e) => { e.preventDefault(); title.current?.focus(); }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (continueToForm.current) {
              continueToForm.current = false;
              requestAnimationFrame(focusReportRequest);
            } else {
              reopenButton.current?.focus({ preventScroll: true });
            }
          }}
          data-testid="dialog-results-summary"
        >
          <div className="min-h-0 overflow-y-auto p-5 pr-14 sm:p-7 sm:pr-16">
            <p className="text-base font-semibold text-[hsl(36_75%_26%)]">Краткий результат</p>
            <DialogTitle ref={title} tabIndex={-1} className="hd mt-2 break-words text-2xl text-primary sm:text-3xl" data-testid="text-dialog-company">{company}</DialogTitle>
            <div className="mt-5 rounded-lg border-l-4 border-accent bg-secondary/60 p-4" data-testid="status-dialog-risk">
              <p className="text-base text-foreground">Статус риска</p>
              <p className="hd text-2xl text-primary">Риск не определён</p>
            </div>
            <DialogDescription className="mt-4 text-lg leading-relaxed text-foreground">{getNeutralReportText(reportId)}</DialogDescription>
            <p className="mt-3 rounded-md border border-accent bg-[hsl(40_85%_90%)] p-3 text-base leading-relaxed text-foreground" data-testid="notice-dialog-demo">Предварительный результат: автоматическая сверка с реестрами не выполняется. Для оценки риска требуется рассмотрение специалистом.</p>
            <p className="mt-5 text-base font-semibold text-primary">Что стоит уточнить в подробном отчёте</p>
            <ul className="mt-2 space-y-2">
              {QUESTIONS.map((q) => (
                <li key={q} className="flex gap-3 text-base leading-relaxed text-foreground"><HelpCircle className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{q}</li>
              ))}
            </ul>
            <p className="mt-5 text-base leading-relaxed text-foreground">Оставьте заявку — специалист рассмотрит обращение и отправит подготовленный отчёт в WhatsApp. Отправка вручную, срок зависит от рассмотрения.</p>
          </div>
          <div className="border-t border-border bg-background px-5 py-4 sm:px-7">
            <button type="button" onClick={go} className="hard-btn flex min-h-14 w-full items-center justify-center gap-3 bg-[hsl(152_45%_22%)] px-4 py-3 text-lg font-semibold text-white" data-testid="button-dialog-get-report"><MessageCircle className="h-6 w-6 shrink-0" aria-hidden="true" />Получить полный отчёт в WhatsApp</button>
            <p className="mt-2 text-center text-base text-muted-foreground">Название компании уже заполнено в заявке</p>
            <button type="button" onClick={() => setOpen(false)} className="mt-1 min-h-11 w-full text-base font-semibold text-primary underline underline-offset-4" data-testid="button-dialog-dismiss">Закрыть и читать результаты</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
