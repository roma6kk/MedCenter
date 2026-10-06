import Link from 'next/link';

export default async function LoginPage({ searchParams }: { readonly searchParams?: Promise<{ returnTo?: string }> }): Promise<React.JSX.Element> {
  const resolved = (await searchParams) ?? {};
  const returnTo = resolved.returnTo ?? '/booking';
  return (
    <div>
      <h1 className="serif text-2xl font-bold">Вход</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">Безопасный вход через SMART on FHIR.</p>
      <a href={`/api/auth/authorize?returnTo=${encodeURIComponent(returnTo)}`} className="mt-6 block rounded-[6px] bg-[var(--primary)] px-4 py-2 text-center text-[var(--primary-foreground)]">Войти</a>
      <p className="mt-4 text-sm">Нет аккаунта? <Link href="/register" className="underline">Зарегистрироваться</Link></p>
    </div>
  );
}
