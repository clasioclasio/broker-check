import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export const inView = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } };

export function Eyebrow({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <p className={`eyebrow mb-3 ${dark ? 'text-[hsl(36_75%_26%)]' : 'text-[hsl(36_75%_26%)]'}`}>{children}</p>;
}

const PARTS = [
  { t: 'Лицензия', d: 'Кто и когда выдал компании разрешение работать с клиентами. Важны полное название юрлица, регулятор и номер: их можно сверить в реестре самого регулятора. Название бренда на сайте само по себе ничего не доказывает.' },
  { t: 'Предупреждения', d: 'Публичные заявления регуляторов о том, что компания действует без разрешения или вводит клиентов в заблуждение. Это документы с датой и источником, а не оценка сайта.' },
  { t: 'Жалобы', d: 'Сообщения клиентов о выводе средств, блокировке, дополнительных платежах. Это мнения и пересказы: они показывают, какие вопросы задать, но не устанавливают факт нарушения.' },
  { t: 'Юридические риски', d: 'Выводы из договора и структуры компании: какое право применимо, где можно спорить, кто получатель платежей. Требуют чтения самих документов.' },
];

export function ReportAnatomy() {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <Eyebrow>Как читать отчёт</Eyebrow>
        <h2 className="hd text-3xl text-primary sm:text-4xl">Что означает каждая часть отчёта</h2>
        <p className="prose-ru mt-5 text-lg text-muted-foreground">В отчёте четыре раздела. Они отвечают на разные вопросы, поэтому складывать их в одну оценку нельзя: мы намеренно не выводим баллов и «индекса надёжности».</p>
      </div>
      <dl className="divide-y divide-border">
        {PARTS.map((p, i) => (
          <motion.div key={p.t} {...inView} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="hd text-lg text-primary"><span className="mr-2 text-base text-[hsl(36_75%_26%)]">{i + 1}.</span>{p.t}</dt>
            <dd className="text-lg leading-relaxed text-muted-foreground">{p.d}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

const READ = [
  { t: 'Подтверждённый факт', dot: 'bg-[hsl(152_28%_38%)]', d: 'Есть документ или запись в реестре, дата и ссылка. Пример: регулятор опубликовал предупреждение о компании. Факт стоит сверить самостоятельно по ссылке.', how: 'Опирайтесь на него, но проверяйте дату: сведения устаревают.' },
  { t: 'Жалоба или мнение', dot: 'bg-accent', d: 'Отзыв клиента, пост, пересказ. Может быть правдой, ошибкой или заказным текстом. Мы показываем жалобы отдельно, чтобы они не выглядели установленными фактами.', how: 'Ищите повторяющиеся детали: сроки, суммы, формулировки отказов.' },
  { t: 'Нет данных', dot: 'bg-muted-foreground', d: 'Источник не нашёл сведений или не опрашивался. Это не «чисто» и не «плохо»: компания может быть новой, работать под другим названием или лежать вне охвата поиска.', how: 'Не успокаивайтесь и не пугайтесь: сверьте реестр вручную и запросите документы у компании.' },
];

export function ReadingStatuses() {
  return (
    <div>
      <Eyebrow>Три вида сведений</Eyebrow>
      <h2 className="hd text-3xl text-primary sm:text-4xl">«Факт», «жалоба» и «нет данных» — разные вещи</h2>
      <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        {READ.map((r, i) => (
          <motion.div key={r.t} {...inView} transition={{ ...inView.transition, delay: i * 0.08 }} className="md:px-7 md:first:pl-0 md:last:pr-0">
            <span className={`mb-4 block h-1.5 w-12 rounded-full ${r.dot}`} />
            <h3 className="hd text-xl text-primary">{r.t}</h3>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{r.d}</p>
            <p className="mt-3 text-base font-medium leading-relaxed text-primary"><span className="text-[hsl(36_75%_26%)]">Что делать: </span>{r.how}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const DEMO_ROWS = [
  ['Источники', 'Реестры и регуляторы не подключены, данные не запрашиваются', 'Сверка названия юрлица и номера лицензии с реестром регулятора, чтение договора'],
  ['Содержание отчёта', 'Пояснения о структуре отчёта и статус «недостаточно данных»', 'Подтверждения с датами, ссылками и копиями документов'],
  ['Жалобы', 'Не собираются', 'Сопоставляются с вашими документами и хронологией'],
  ['Вывод', 'Не оценивает компанию и не говорит о её надёжности', 'Выводит юрист, изучивший конкретную ситуацию'],
];

export function DemoVsReal() {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <Eyebrow>Как получить подробную информацию</Eyebrow>
        <h2 className="hd text-3xl text-primary sm:text-4xl">Предварительный результат и подробное рассмотрение</h2>
        <p className="prose-ru mt-5 text-lg text-muted-foreground">Статус «недостаточно данных» означает, что риск пока не определён. Он не подтверждает ни надёжность компании, ни нарушения. Для подробного рассмотрения оставьте заявку специалисту.</p>
      </div>
      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-border">
        <div className="hidden grid-cols-[8rem_1fr_1fr] gap-4 bg-secondary/70 px-5 py-3 text-sm font-semibold text-secondary-foreground sm:grid"><span /><span>Предварительный результат</span><span>Что требует изучения</span></div>
        {DEMO_ROWS.map(([a, b, c]) => (
          <div key={a} className="grid gap-1 border-t border-border px-5 py-4 text-base leading-relaxed first:border-t-0 sm:grid-cols-[8rem_1fr_1fr] sm:gap-4">
            <span className="font-semibold text-primary">{a}</span>
            <span className="text-muted-foreground"><span className="font-semibold text-primary sm:hidden">Предварительно: </span>{b}</span>
            <span className="text-muted-foreground"><span className="font-semibold text-primary sm:hidden">Требует изучения: </span>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PREP = [
  'Договор, оферта или условия, которые вы принимали на сайте',
  'Чеки, выписки и квитанции по каждому переводу с датами и суммами',
  'Реквизиты получателей: названия, счета, кошельки, банки',
  'Переписка с менеджерами, письма и чаты целиком, без вырезок',
  'Скриншоты кабинета: баланс, заявки на вывод, отказы',
  'Адрес сайта, юридическое лицо и номер лицензии, если они указаны',
  'Короткая хронология: что и когда произошло, что ответила компания',
  'Ваш вопрос специалисту: чего вы хотите добиться',
];

export function PrepChecklist() {
  const [on, setOn] = useState<number[]>([]);
  const toggle = (i: number) => setOn((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));
  return (
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <Eyebrow dark>Подготовка к обращению</Eyebrow>
        <h2 className="hd text-3xl sm:text-4xl">Что собрать перед разговором со специалистом</h2>
        <p className="prose-ru mt-5 text-lg text-foreground">Не хватает части документов — всё равно обращайтесь: по оставшимся можно понять, что запросить дополнительно. Отметки ниже нужны только для вас и нигде не сохраняются.</p>
        <p className="mt-4 text-base font-medium text-[hsl(36_75%_26%)]" aria-live="polite">Отмечено: {on.length} из {PREP.length}</p>
      </div>
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {PREP.map((p, i) => {
          const c = on.includes(i);
          return (
            <li key={p} className="border-b border-border">
              <button type="button" onClick={() => toggle(i)} aria-pressed={c} className="flex w-full items-start gap-3 py-4 text-left text-lg leading-relaxed" data-testid={`prep-item-${i}`}>
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${c ? 'border-accent bg-accent text-accent-foreground' : 'border-primary bg-white'}`}>{c && <Check className="h-3.5 w-3.5" />}</span>
                <span className={c ? 'text-foreground line-through decoration-primary/60' : 'text-foreground'}>{p}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const BEFORE = [
  { t: 'Остановитесь', d: 'Пока нет письменного обоснования, не переводите ни «налог», ни «страховку», ни «комиссию за разблокировку».' },
  { t: 'Спросите письменно', d: 'Попросите указать пункт договора, на основании которого требуется платёж, и юридическое лицо-получателя.' },
  { t: 'Сверьте реестр', d: 'Найдите регулятора и номер лицензии на сайте самого регулятора, а не по ссылке из чата компании.' },
  { t: 'Сохраните доказательства', d: 'Сделайте копии переписки и кабинета сейчас: доступ могут закрыть.' },
  { t: 'Поговорите с банком', d: 'Уточните, можно ли оспорить уже совершённые операции и какие сроки действуют для вашего способа платежа.' },
];

export function BeforeTransfer() {
  return (
    <div>
      <Eyebrow>Прежде чем отправлять ещё деньги</Eyebrow>
      <h2 className="hd max-w-3xl text-3xl text-primary sm:text-4xl">Пять вопросов, которые стоит закрыть заранее</h2>
      <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
        {BEFORE.map((b, i) => (
          <motion.li key={b.t} {...inView} transition={{ ...inView.transition, delay: i * 0.06 }}>
            <span className="hd text-3xl text-[hsl(36_75%_26%)]">{i + 1}</span>
            <h3 className="hd mt-2 text-lg text-primary">{b.t}</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{b.d}</p>
          </motion.li>
        ))}
      </ol>
      <p className="mt-10 max-w-3xl rounded-md bg-secondary/70 p-4 text-base leading-relaxed text-secondary-foreground">Эти шаги не гарантируют возврата средств и не заменяют консультацию юриста. Они помогают не усугубить ситуацию и сохранить варианты.</p>
    </div>
  );
}
