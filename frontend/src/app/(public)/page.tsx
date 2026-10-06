import Link from 'next/link';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="serif text-3xl font-bold">Медицинский центр</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">Запись на приём и ведение клинической документации.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/doctors" className="rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Найти врача</Link>
        <Link href="/login" className="rounded-[6px] border border-[var(--border)] px-4 py-2">Войти</Link>
      </div>
    </main>
  );
}
