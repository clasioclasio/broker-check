const KEY = 'broker-check:company';

export function saveCompany(name: string) {
  try {
    sessionStorage.setItem(KEY, name);
  } catch {
    /* storage unavailable */
  }
}

export function loadCompany(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function goToSection(id: string, here: boolean, navigate: (p: string) => void) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  if (here) {
    scroll();
  } else {
    navigate('/');
    window.setTimeout(scroll, 150);
  }
}
