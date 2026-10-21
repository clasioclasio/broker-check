import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useGetPlatform } from '@workspace/api-client-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/site-chrome';
import { ConsultationSection, useConsultation } from '@/components/consultation';
import { loadCompany, saveCompany } from '@/lib/company';
import { BeforeTransfer, DemoVsReal, Eyebrow, PrepChecklist, ReadingStatuses, ReportAnatomy } from '@/components/guides';

const FALLBACK_STAGES = [
  'Идентификация финансовой компании',
  'Поиск сведений о лицензировании',
  'Анализ регуляторной информации',
  'Проверка публичных предупреждений',
  'Анализ сообщений о проблемах с выводом средств',
  'Формирование предварительного отчета',
];

const BENEFITS = ['Структура предварительного отчёта', 'Пояснения к статусу данных', 'Вопросы для самостоятельной проверки', 'Возможность консультации'];

const STEPS = [
  { t: 'Введите название компании', d: 'Название брокера, обычной компании или адрес её сайта.' },
  { t: 'Ознакомьтесь с результатами', d: 'Отчет разделен на лицензию, предупреждения, жалобы и юридические риски.' },
  { t: 'Изучите выявленные риски', d: 'Если данных нет, мы так и скажем: без выдуманных предупреждений.' },
  { t: 'Запросите дополнительный анализ', d: 'Оставьте запрос, чтобы специалист изучил обстоятельства вашего обращения.' },
];

const SIGNS = [
  { t: 'Отсутствие подтвержденной лицензии', d: 'Компания не указывает регулятора или номер лицензии, который можно проверить в официальном реестре.' },
  { t: 'Сложности с выводом средств', d: 'Заявки на вывод откладываются, отклоняются без внятных причин или требуют новых условий.' },
  { t: 'Необоснованные дополнительные платежи', d: 'Для вывода просят налог, комиссию или страховой взнос, не прописанные в договоре.' },
  { t: 'Недостоверная информация о компании', d: 'Юридическое лицо, адрес или история бизнеса противоречат друг другу в разных источниках.' },
  { t: 'Блокировка доступа к кабинету', d: 'Личный кабинет закрывается после запроса на вывод или спора по условиям.' },
  { t: 'Нет прозрачных контактов', d: 'Нет реквизитов, юридического адреса и каналов связи, кроме мессенджера или чата.' },
];

const ACTIONS = [
  'Не вносите дополнительные платежи до выяснения оснований и не передавайте доступ к счетам и устройствам.',
  'Сохраните переписку, договор-оферту, скриншоты кабинета, платежные документы и реквизиты получателей.',
  'Письменно направьте компании претензию и сохраните подтверждение отправки.',
  'Обратитесь в банк или платежный сервис, через которые переводились средства, и уточните порядок оспаривания операций.',
  'Проверьте компанию в официальных реестрах регуляторов и подайте обращение в профильный орган вашей страны.',
];

const FAQ = [
  { q: 'Как проверить лицензию брокера?', a: 'Найдите в договоре или на сайте полное наименование юридического лица и номер лицензии, затем сверьте их в официальном реестре регулятора соответствующей страны. Названия регуляторов и номера лицензий лучше сверять напрямую на сайте самого регулятора: автоматическая сверка с реестрами на платформе не выполняется.' },
  { q: 'Можно ли доверять брокеру без лицензии?', a: 'Отсутствие подтвержденной лицензии не доказывает недобросовестность, но означает, что у вас нет подтвержденной регуляторной защиты. Это повод внимательнее изучить договор и запросить пояснения у компании.' },
  { q: 'Что делать, если компания не выводит средства?', a: 'Сохраните все документы и переписку, не вносите дополнительных платежей, письменно направьте претензию и обратитесь в банк или платежный сервис. Для оценки ситуации можно оставить запрос на консультацию.' },
  { q: 'Куда обращаться при возникновении спора?', a: 'Порядок зависит от юрисдикции компании и способа платежа: это может быть претензионный порядок, обращение к регулятору, в банк, в правоохранительные органы или в суд. Конкретный путь определяет юрист по документам.' },
  { q: 'Можно ли вернуть переведенные средства?', a: 'Это зависит от обстоятельств: способа перевода, сроков, документов и юрисдикции. Результат никто не может гарантировать, и мы не обещаем возврата. Чем раньше собраны документы, тем точнее можно оценить варианты.' },
  { q: 'Какие документы нужны для юридической консультации?', a: 'Договор или оферта, чеки и выписки по переводам, переписка с представителями компании, скриншоты кабинета, реквизиты получателей и хронология событий. Если чего-то нет, это не препятствует обращению.' },
];


const inView = { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } };

export default function Home() {
  const [, navigate] = useLocation();
  const [company, setCompany] = useState(loadCompany());
  const [error, setError] = useState('');
  const { open } = useConsultation();
  const platform = useGetPlatform();
  const initial = useRef(loadCompany());
  useEffect(() => { initial.current = loadCompany(); }, []);

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const v = company.trim();
    if (v.length < 2) return setError('Введите название не короче 2 символов');
    if (v.length > 200) return setError('Название не должно превышать 200 символов');
    saveCompany(v);
    navigate('/analysis');
  };

  const stages = platform.data?.stages?.length ? platform.data.stages : FALLBACK_STAGES;

  return (
    <PageShell>
      {/* HERO */}
      <section id="top" className="ink relative overflow-hidden">
        <div className="flag-backdrop" aria-hidden="true" style={{ ['--flags' as string]: `url(${import.meta.env.BASE_URL}europe-flags-hero.webp)` }}>
          <div className="flag-backdrop__side flag-backdrop__side--l" />
          <div className="flag-backdrop__side flag-backdrop__side--r" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-16 sm:pt-12 md:pb-20 md:pt-20">
          <p className="mb-4 text-base font-semibold text-primary">Независимая информационно-юридическая платформа</p>
          <h1 className="hd text-[clamp(2.1rem,6vw,3.75rem)] text-primary" data-testid="text-hero-title">Проверка брокеров и компаний</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-foreground sm:text-lg">Разберитесь, какие отзывы, документы и признаки возможного мошенничества стоит проверить перед сотрудничеством.</p>
          <form id="check" onSubmit={start} className="mx-auto mt-6 max-w-3xl scroll-mt-48 text-left sm:mt-8" data-testid="form-check">
            <label htmlFor="company-search" className="mb-2 block text-center text-lg font-semibold text-primary">Введите название брокера, компании или адрес сайта</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="company-search"
                value={company}
                onChange={(e) => { setCompany(e.target.value); setError(''); }}
                placeholder="Название компании или сайт"
                maxLength={200}
                aria-label="Название брокера или компании"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'company-search-error' : 'company-search-help'}
                className="h-14 w-full min-w-0 rounded-md border-2 border-primary bg-white px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-offset-2 sm:h-16 sm:flex-1 sm:px-4 sm:text-lg"
                data-testid="input-company-search"
              />
              <button type="submit" className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 sm:h-16 sm:w-auto sm:px-8 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90" data-testid="button-start-check">
                Начать проверку <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            {error && <p id="company-search-error" className="mt-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-base font-medium text-destructive" role="alert" data-testid="text-search-error">{error}</p>}
          </form>
          <p id="company-search-help" className="mx-auto mt-4 max-w-2xl text-base text-foreground">Откроется предварительный результат, ссылки для самостоятельного поиска отзывов и форма обращения к специалисту. Автоматическая проверка компании сейчас не выполняется.</p>

          <div className="mx-auto mt-10 max-w-3xl rounded-md border-2 border-[hsl(36_75%_38%)] bg-[hsl(40_85%_92%)] p-5 text-left text-base leading-relaxed text-foreground" data-testid="notice-demo">
            <strong className="block font-semibold">Предварительная информация — не заключение о компании.</strong>
            <span className="mt-1 block">{platform.isLoading ? <Skeleton className="inline-block h-4 w-64 max-w-full bg-white/70" /> : platform.data?.notice ?? 'Автоматическая сверка с реестрами не выполняется. Для оценки риска и подробной информации оставьте заявку специалисту.'}</span>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-8 border-t border-border pt-10 text-left md:grid-cols-2">
            <dl className="space-y-3 text-base leading-relaxed">
              <p className="text-lg font-semibold text-primary">Несколько слов, которые встретятся</p>
              <div><dt className="inline font-semibold text-primary">Брокер</dt><dd className="inline"> — компания-посредник, через которую покупают акции, валюту и другие активы.</dd></div>
              <div><dt className="inline font-semibold text-primary">Регулятор</dt><dd className="inline"> — орган, который контролирует работу брокера.</dd></div>
              <div><dt className="inline font-semibold text-primary">Лицензия</dt><dd className="inline"> — официальное разрешение на определённую деятельность. Её наличие нужно сверить в реестре регулятора.</dd></div>
            </dl>
            <div>
              <p className="text-lg font-semibold text-primary">Из чего состоит отчёт</p>
              <ol className="mt-3 divide-y divide-border border-y border-border">
                {[['Лицензия', 'кто разрешил работать'], ['Предупреждения', 'заявления регуляторов'], ['Жалобы', 'мнения клиентов, отдельно'], ['Юридические риски', 'условия и структура']].map(([a, b], i) => (
                  <li key={a} className="flex items-baseline gap-3 py-2.5 text-base"><span className="w-5 font-semibold text-primary">{i + 1}.</span><span className="font-semibold text-primary">{a}</span><span className="ml-auto min-w-0 text-right text-muted-foreground">{b}</span></li>
                ))}
              </ol>
              <p className="mt-3 text-base leading-relaxed">«Нет данных» — нейтральный статус. Он не означает ни безопасности, ни нарушения.</p>
            </div>
          </div>
          <div className="mt-8" aria-label="Преимущества">
            <ul className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-base text-foreground">
              {BENEFITS.map((b) => <li key={b} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{b}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="bg-background">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28">
          <div className="mb-12 max-w-2xl"><Eyebrow>Как это работает</Eyebrow><h2 className="hd text-3xl text-primary sm:text-4xl md:text-5xl">Как проходит проверка</h2></div>
          <ol className="relative grid gap-10 md:grid-cols-4 md:gap-8">
            <div className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-border md:block" />
            {STEPS.map((s, i) => (
              <motion.li key={s.t} {...inView} transition={{ ...inView.transition, delay: i * 0.08 }} className="relative" data-testid={`card-step-${i + 1}`}>
                <span className="hd relative grid h-10 w-10 place-items-center rounded-full bg-primary text-base text-primary-foreground">{i + 1}</span>
                <h3 className="hd mt-5 text-xl text-primary">{s.t}</h3>
                <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{s.d}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ANATOMY + STATUSES */}
      <section className="bg-secondary/50">
        <div className="mx-auto max-w-7xl space-y-20 px-4 py-20 sm:px-6 md:space-y-28 md:py-28">
          <ReportAnatomy />
          <ReadingStatuses />
        </div>
      </section>

      {/* SIGNS */}
      <section className="bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[0.8fr_1.4fr]">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Eyebrow>На что смотреть</Eyebrow>
            <h2 className="hd text-3xl text-primary sm:text-4xl md:text-5xl">Возможные признаки проблемного брокера</h2>
            <p className="prose-ru mt-5 text-lg text-muted-foreground">Признаки не доказывают нарушение сами по себе. Они помогают понять, какие вопросы стоит задать компании до передачи денег. Один признак — повод уточнить, несколько сразу — повод остановиться.</p>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {SIGNS.map((s, i) => (
              <motion.li key={s.t} {...inView} className="grid grid-cols-[2.5rem_1fr] gap-x-3 py-6 sm:grid-cols-[3rem_1fr_1.1fr] sm:gap-x-6" data-testid={`card-sign-${i}`}>
                <span className="hd text-2xl text-[hsl(36_75%_26%)]">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="hd text-lg text-primary">{s.t}</h3>
                <p className="col-start-2 mt-2 text-lg leading-relaxed text-muted-foreground sm:col-start-3 sm:mt-0">{s.d}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ACTIONS */}
      <section id="actions" className="ink">
        <div className="mx-auto max-w-7xl space-y-20 px-4 py-20 sm:px-6 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="min-w-0 lg:sticky lg:top-32 lg:self-start">
              <Eyebrow dark>Если проблема уже есть</Eyebrow>
              <h2 className="hd text-3xl sm:text-4xl md:text-5xl">Что делать при проблемах с брокером?</h2>
              <p className="prose-ru mt-5 text-foreground">Спокойная последовательность действий. Результат в споре зависит от обстоятельств, и мы не обещаем возврата средств.</p>
              <button type="button" onClick={() => open(loadCompany())} className="hard-btn mt-8 min-h-14 w-full bg-accent px-5 sm:w-auto sm:px-7 text-lg font-semibold text-accent-foreground" data-testid="button-open-consultation-home">Запросить консультацию ↓</button>
            </div>
            <ol className="divide-y divide-border border-y border-border">
              {ACTIONS.map((a, i) => (
                <motion.li key={i} {...inView} className="flex gap-5 py-6" data-testid={`item-action-${i}`}>
                  <span className="hd w-8 shrink-0 text-3xl leading-none text-[hsl(36_75%_26%)]">{i + 1}</span>
                  <p className="text-lg leading-relaxed text-foreground">{a}</p>
                </motion.li>
              ))}
            </ol>
          </div>
          <div className="border-t border-border pt-16"><PrepChecklist /></div>
        </div>
      </section>

      {/* BEFORE TRANSFER */}
      <section className="bg-background">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28"><BeforeTransfer /></div>
      </section>

      {/* METHODOLOGY */}
      <section id="methodology" className="bg-secondary/50">
        <div className="mx-auto max-w-7xl space-y-20 px-4 py-20 sm:px-6 md:space-y-24 md:py-28">
          <div>
            <div className="mb-10 grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
              <div><Eyebrow>Методология</Eyebrow><h2 className="hd text-3xl text-primary sm:text-4xl md:text-5xl">Как устроена проверка и чем она не является</h2></div>
              <p className="text-base leading-relaxed text-muted-foreground">Мы разделяем подтвержденные факты, мнения пользователей и отсутствие данных. Отсутствие данных не считается негативным признаком.</p>
            </div>
            <div className="grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
              {[
                { t: 'Факт', d: 'Только то, что подтверждено документом или официальным реестром, со ссылкой и датой.', c: 'bg-[hsl(152_28%_38%)]' },
                { t: 'Мнение пользователей', d: 'Жалобы всегда показываются отдельно и не выдаются за установленные факты.', c: 'bg-accent' },
                { t: 'Нет данных', d: 'Нейтральный статус. Он не означает ни безопасности, ни нарушения.', c: 'bg-muted-foreground' },
              ].map((c, i) => (
                <motion.div key={c.t} {...inView} transition={{ ...inView.transition, delay: i * 0.08 }} className="py-7 md:px-7 md:first:pl-0 md:last:pr-0">
                  <span className={`mb-4 block h-1.5 w-12 rounded-full ${c.c}`} />
                  <h3 className="hd text-xl text-primary">{c.t}</h3><p className="mt-2 text-lg leading-relaxed text-muted-foreground">{c.d}</p>
                </motion.div>
              ))}
            </div>
          </div>
          <DemoVsReal />
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <h3 className="hd text-2xl text-primary sm:text-3xl">Направления подробного рассмотрения</h3>
            <div>
              <ol className="divide-y divide-border border-y border-border">
                {platform.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="my-2 h-10 w-full" />)
                  : stages.map((s, i) => (
                      <li key={s} className="flex items-center gap-4 py-3.5 text-lg" data-testid={`item-stage-${i}`}>
                        <span className="hd w-8 text-xl text-[hsl(36_75%_26%)]">{i + 1}</span>{s}
                      </li>
                    ))}
              </ol>
              <p className="mt-5 rounded-md bg-card p-4 text-base leading-relaxed text-muted-foreground ring-1 ring-border">Перечень помогает понять, какие вопросы стоит обсудить со специалистом. Автоматический поиск сведений в реестрах не выполняется.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-background">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="hd text-3xl text-primary sm:text-4xl md:text-5xl">Часто задаваемые вопросы</h2>
          </div>
          <Accordion type="single" collapsible className="w-full border-t border-border">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`} className="border-b border-border" data-testid={`faq-item-${i}`}>
                <AccordionTrigger className="py-5 text-left font-display text-base font-semibold leading-snug hover:no-underline sm:text-lg">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-6 text-lg leading-relaxed text-muted-foreground max-w-prose">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-accent/90">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <h2 className="hd text-2xl text-accent-foreground sm:text-3xl md:text-4xl">Начните с названия компании</h2>
          <button type="button" className="hard-btn h-14 w-full shrink-0 bg-primary px-8 md:w-auto text-lg font-semibold text-primary-foreground" onClick={() => { document.getElementById('check')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('check')?.querySelector('input')?.focus({ preventScroll: true }); }} data-testid="button-cta-check">Проверить компанию</button>
        </div>
      </section>

      <ConsultationSection company={initial.current} />
    </PageShell>
  );
}

