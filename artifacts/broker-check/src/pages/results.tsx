import { Link, useParams } from 'wouter';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { getGetCheckQueryKey, useGetCheck } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/site-chrome';
import { ReportRequestSection, focusReportRequest } from '@/components/report-request-section';
import { ResultsSummaryDialog } from '@/components/results-summary-dialog';
import { getNeutralReportText } from '@/lib/report-request';
import { BeforeTransfer, DemoVsReal, ReadingStatuses } from '@/components/guides';
import { formatDate, saveCompany } from '@/lib/company';

export default function Results() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const { data, isLoading, isError, refetch } = useGetCheck(id, { query: { enabled: !!id, queryKey: getGetCheckQueryKey(id) } });

  return (
    <PageShell>
      <div className="ink">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 md:pt-16">
          {isLoading && (
            <div className="space-y-5" data-testid="skeleton-results">
              <Skeleton className="h-5 w-60 bg-white/70" /><Skeleton className="h-28 w-3/4 bg-white/70" /><Skeleton className="h-24 w-full bg-white/70" />
            </div>
          )}
          {isError && (
            <div className="rounded-lg border border-destructive/50 bg-white/70 p-8" role="alert" data-testid="status-results-error">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <h1 className="hd mt-4 text-3xl sm:text-4xl">Отчет не найден или не загрузился</h1>
              <p className="mt-3 max-w-md text-base text-foreground">Проверьте ссылку или повторите загрузку. Также можно запустить новую предварительную проверку.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => refetch()} className="bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-retry-report"><RotateCcw className="mr-2 h-4 w-4" />Повторить</Button>
                <Button variant="outline" asChild className="border-primary bg-transparent text-primary hover:bg-white"><Link href="/" data-testid="link-error-home">На главную</Link></Button>
              </div>
            </div>
          )}
          {data && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <div className="mb-10 rounded-lg border-2 border-accent bg-[hsl(40_85%_90%)] p-4 text-base leading-relaxed text-foreground" data-testid="notice-demo-results">
                  {data.disclaimer}
                </div>
                <p className="eyebrow text-[hsl(36_75%_26%)]">Результат предварительной проверки</p>
                <h1 className="hd mt-4 break-words text-[clamp(2.25rem,7vw,4.5rem)]" data-testid="text-report-company">{data.company}</h1>
                <p className="mt-3 text-base text-foreground" data-testid="text-report-date">Дата проверки: {formatDate(data.createdAt)}</p>
                <div className="mt-10 rounded-lg border-l-4 border-accent bg-white p-6 shadow-sm ring-1 ring-border sm:p-8" data-testid="card-status">
                  <p className="text-base font-semibold text-[hsl(36_75%_26%)]">Статус отчёта</p>
                  <h2 className="hd mt-2 text-2xl text-primary sm:text-3xl">Риск не определён</h2>
                  <p className="prose-ru mt-3 text-lg text-foreground" data-testid="text-report-status">{getNeutralReportText(data.id)}</p>
                  <p className="mt-4 text-lg font-semibold text-primary">Для получения подробной информации оставьте заявку</p>
                  <button type="button" className="hard-btn mt-4 min-h-14 bg-[hsl(152_45%_22%)] px-6 py-3 text-left text-lg font-semibold text-white" onClick={focusReportRequest} data-testid="button-open-consultation-results">Получить полный отчёт в WhatsApp</button>
                  <p className="mt-3 max-w-xl text-base text-foreground">Подробный отчёт специалист подготовит вручную и направит в WhatsApp после рассмотрения заявки.</p>
                </div>
              </motion.div>
            )}
        </div>
      </div>

      {data && (
        <div className="bg-background">
          <ResultsSummaryDialog key={data.id} reportId={data.id} company={data.company} />
          <ReportRequestSection reportId={data.id} company={data.company} />
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.5fr_1.5fr]">
              <div className="lg:sticky lg:top-32 lg:self-start"><h2 className="hd text-3xl text-primary sm:text-4xl">Разделы отчёта</h2><p className="mt-3 max-w-xs text-base leading-relaxed text-muted-foreground">Каждый раздел отвечает на свой вопрос. Читайте их по отдельности.</p></div>
              <div className="divide-y divide-border border-y border-border">
                {data.sections.map((s, i) => (
                  <motion.section key={s.title + i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="grid gap-x-6 py-7 sm:grid-cols-[3.5rem_1fr]" data-testid={`card-section-${i}`}>
                    <span className="hd text-2xl text-[hsl(36_75%_26%)]">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="hd text-xl text-primary">{s.title}</h3>
                      <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{s.content}</p>
                    </div>
                  </motion.section>
                ))}
              </div>
            </div>

            {data.recommendations.length > 0 && (
              <section className="mt-16 rounded-lg bg-secondary/70 p-6 sm:p-10" data-testid="card-recommendations">
                <h3 className="hd text-2xl text-primary sm:text-3xl">Рекомендации</h3>
                <ul className="mt-6 space-y-4">
                  {data.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-4 text-lg leading-relaxed"><span className="mt-2.5 h-1.5 w-4 shrink-0 rounded-full bg-primary" />{r}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-20"><ReadingStatuses /></div>
            <div className="mt-20"><DemoVsReal /></div>
            <div className="mt-20"><BeforeTransfer /></div>

            <div className="mt-8">
              <Link href="/" onClick={() => saveCompany('')} className="inline-flex items-center gap-2 text-base font-semibold text-primary underline underline-offset-4" data-testid="link-check-another"><RotateCcw className="h-4 w-4" />Проверить другую компанию</Link>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
