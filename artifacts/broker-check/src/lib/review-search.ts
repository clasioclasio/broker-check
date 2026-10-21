const REVIEW_SITES = [
  { name: 'Trustpilot', domain: 'trustpilot.com' },
  { name: 'Sitejabber', domain: 'sitejabber.com' },
  { name: 'Отзовик', domain: 'otzovik.com' },
  { name: 'IRecommend', domain: 'irecommend.ru' },
] as const;

/** External manual searches, not collected reviews or live integration results. */
export function reviewSearchLinks(company: string) {
  const name = company.trim().replace(/"/g, '');
  return REVIEW_SITES.map((site) => ({
    ...site,
    href: `https://www.google.com/search?q=${encodeURIComponent(`"${name}" отзывы site:${site.domain}`)}`,
  }));
}
