import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Info, Loader2, RotateCcw } from 'lucide-react';
import { useCreateCheck, useGetPlatform } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/site-chrome';
import { loadCompany } from '@/lib/company';

const FALLBACK = [
  'Название финансовой компании',
  'Сведения о лицензировании',
  'Регуляторная информация',
  'Публичные предупреждения',
  'Вопросы о выводе средств',
  'Предварительный результат',
];

const DURATION = 5600;

export default function Analysis() {
  const [, navigate] = useLocation();
  const company = loadCompany();
  const platform = useGetPlatform();
  const mutation = useCreateCheck();
  const [progress, setProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [run, setRun] = useState(0);
  const startedRun = useRef(-1);
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const stages = platform.data?.stages?.length ? platform.data.stages : FALLBACK;

  useEffect(() => {
    if (!company) navRef.current('/');
  }, [company]);

  useEffect(() => {
    if (!company || startedRun.current === run) return;
    startedRun.current = run;
    setProgress(0);
    setAnimDone(false);
    mutateRef.current({ data: { company } });
  }, [run, company]);

  useEffect(() => {
    if (!company) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setAnimDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, company]);

  const report = mutation.data;
  useEffect(() => {
    if (animDone && report) navRef.current(`/results/${report.id}?summary=1`);
  }, [animDone, report]);

  const pct = Math.round(progress * 100);
  const active = Math.min(stages.length - 1, Math.floor(progress * stages.length));
  const failed = mutation.isError;
  const waiting = animDone && !report && !failed;

  return (
    <PageShell>
      <section className="ink relative overflow-hidden">
        <div className="dots pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-8 flex items-start gap-3 rounded-lg bg-white/80 ring-1 ring-border p-4 text-base leading-relaxed" data-testid="notice-demo-analysis">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(36_75%_26%)]" />
            <p>Подготавливаем страницу предварительного результата. Индикатор показывает её подготовку, а не проверку реестров. Оценка риска требует рассмотрения специалистом.</p>
          </div>

          <p className="text-base font-semibold text-[hsl(36_75%_26%)]">Подготовка предварительного результата</p>
          <h1 className="hd mt-3 break-words text-3xl sm:text-5xl" data-testid="text-analysis-company">{company}</h1>

          <div className="mt-10 rounded-lg bg-card p-6 text-foreground shadow-sm sm:p-8">
            <div className="mb-3 flex items-end justify-between">
              <span className="text-base font-medium text-muted-foreground">Подготовка результата</span>
              <span className="font-mono text-3xl text-primary" data-testid="text-progress">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent" style={{ transform: `scaleX(${progress})`, willChange: 'transform' }} />
            </div>
            <ul className="mt-8 space-y-1">
              {stages.map((s, i) => {
                const done = i < active || animDone;
                const cur = i === active && !animDone;
                return (
                  <motion.li key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: i <= active ? 1 : 0.35, x: 0 }} className="flex items-center gap-4 rounded-md px-2 py-3" data-testid={`stage-${i}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${done ? 'border-[hsl(152_28%_38%)] bg-[hsl(152_28%_38%)] text-white' : cur ? 'border-accent text-[hsl(36_75%_26%)]' : 'border-border text-muted-foreground'}`}>
                      {done ? <Check className="h-4 w-4" /> : cur ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="font-mono text-xs">{i + 1}</span>}
                    </span>
                    <span className={`text-lg ${cur ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{s}</span>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          <div className="mt-8 text-base leading-relaxed text-foreground">
            <p className="font-semibold text-[hsl(36_75%_26%)]">Что будет дальше</p>
            <p className="mt-2 max-w-xl">На странице результата можно оставить заявку на подробное рассмотрение. Название компании уже будет указано — вам останется заполнить контактные данные.</p>
          </div>

          {waiting && (
            <p className="mt-6 flex items-center gap-2 text-base text-foreground" data-testid="status-saving"><Loader2 className="h-4 w-4 animate-spin" /> Сохраняем предварительный результат…</p>
          )}
          {failed && (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-card p-5 text-foreground" role="alert" data-testid="status-check-error">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><p className="text-base">Не удалось сформировать отчет. Проверьте соединение и попробуйте снова.</p></div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => { mutation.reset(); setRun((r) => r + 1); }} data-testid="button-retry-check"><RotateCcw className="mr-2 h-4 w-4" /> Повторить</Button>
                <Button variant="outline" asChild><Link href="/" data-testid="link-back-home">Изменить запрос</Link></Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
