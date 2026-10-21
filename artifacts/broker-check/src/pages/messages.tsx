import { PageShell } from '@/components/site-chrome';
import { ClientMessages } from '@/components/client-messages';

export default function MessagesPage() {
  return (
    <PageShell>
      <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="hd text-3xl text-primary sm:text-4xl">Переписка по вашей заявке</h1>
        <p className="mt-4 text-lg text-muted-foreground">Открывайте эту страницу в том браузере, из которого отправили заявку. Можно сохранить её в закладки.</p>
        <ClientMessages />
      </main>
    </PageShell>
  );
}
