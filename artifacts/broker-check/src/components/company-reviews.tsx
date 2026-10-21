import { ExternalLink } from 'lucide-react';
import { reviewSearchLinks } from '@/lib/review-search';

export function CompanyReviews({ company }: { company: string }) {
  return (
    <section className="mt-10 border-y border-border py-8" aria-labelledby="company-reviews-title" data-testid="section-company-reviews">
      <p className="eyebrow text-[hsl(36_75%_26%)]">Независимые площадки</p>
      <h2 id="company-reviews-title" className="hd mt-3 text-2xl text-primary sm:text-3xl">Отзывы о компании</h2>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-foreground">
        Найдите отзывы о «<span className="break-words">{company}</span>». Название уже добавлено в поисковый запрос.
        Сверьте сайт, страну и юридическое лицо: отзывы могут относиться к другой компании с таким же названием.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {reviewSearchLinks(company).map((site) => (
          <a key={site.domain} href={site.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-between gap-4 rounded-md border border-primary px-5 py-3 text-lg font-semibold text-primary hover:bg-secondary" data-testid={`link-review-${site.domain}`}>
            Искать на {site.name}
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only"> — поиск Google, новая вкладка</span>
          </a>
        ))}
      </div>
      <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground" data-testid="notice-reviews-manual">
        Ссылки открывают поиск Google по выбранной площадке. Автоматический сбор отзывов не подключён.
        Индекс доверия не рассчитан: подтверждённых данных для процентной оценки нет.
        Наличие или отсутствие отзывов само по себе не доказывает надёжность или мошенничество.
      </p>
    </section>
  );
}
