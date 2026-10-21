import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ornaments';
import { goToSection } from '@/lib/company';

const NAV = [
  { id: 'top', label: 'Главная' },
  { id: 'check', label: 'Проверить компанию' },
  { id: 'methodology', label: 'Как это работает' },
  { id: 'consultation', label: 'Получить помощь' },
  { id: 'faq', label: 'Вопросы и ответы' },
];

export function SiteHeader() {
  const [loc, navigate] = useLocation();
  const [menu, setMenu] = useState(false);
  const here = loc === '/';
  const go = (id: string) => {
    setMenu(false);
    if (id === 'top') {
      if (here) window.scrollTo({ top: 0, behavior: 'smooth' });
      else navigate('/');
      return;
    }
    goToSection(id, here, navigate);
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 text-foreground shadow-sm ">
      <div className="mx-auto flex min-h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md py-2 text-primary" data-testid="link-logo"><Logo /></Link>
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Основная навигация">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} className="min-h-11 rounded-md px-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary" data-testid={`link-nav-${n.id}`}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button onClick={() => go('check')} className="hidden h-11 bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90 sm:inline-flex" data-testid="button-header-check">Проверить компанию</Button>
          <button className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-primary px-3 text-base font-medium text-primary xl:hidden" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-controls="mobile-navigation" aria-label="Меню" data-testid="button-menu">
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}<span>Меню</span>
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.nav id="mobile-navigation" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border bg-background xl:hidden" aria-label="Мобильная навигация">
            <div className="flex max-h-[calc(100dvh-4.25rem)] flex-col overflow-y-auto overscroll-contain px-4 py-2">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => go(n.id)} className="min-h-12 border-b border-border py-3 text-left text-lg font-medium" data-testid={`link-mobile-${n.id}`}>{n.label}</button>
              ))}
              <Button onClick={() => go('check')} className="my-4 h-12 bg-primary text-base text-primary-foreground hover:bg-primary/90" data-testid="button-mobile-check">Проверить компанию</Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary text-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <span className="text-primary"><Logo /></span>
        </div>
        <div className="flex flex-col gap-2 text-base md:items-end">
          <Link href="/" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:text-foreground" data-testid="link-footer-home">На главную</Link>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-[100dvh]">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
}
