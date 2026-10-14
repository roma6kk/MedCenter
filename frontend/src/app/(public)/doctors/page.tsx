import Link from 'next/link';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { EmptyState } from '@/components/feedback/states';
import { publicApiFetch } from '@/lib/server-fetch';

interface Doctor { id: string; name: string; specialty: string; }

// Rendered per request, never at build time: `next build` runs where the API is
// unreachable (docker build), and a prerendered page would bake the error banner
// into the static HTML and serve it for the whole revalidate window.
export const dynamic = 'force-dynamic';

async function getDoctors(): Promise<{ readonly ok: true; readonly doctors: ReadonlyArray<Doctor> } | { readonly ok: false }> {
  const result = await publicApiFetch<{ items: Doctor[] }>('/api/v1/doctors');
  if (!result.ok) return { ok: false };
  return { ok: true, doctors: result.data.items };
}

export default async function DoctorsPage(): Promise<React.JSX.Element> {
  const result = await getDoctors();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="serif text-2xl font-bold">Врачи</h1>
      {!result.ok ? (
        <div className="mt-4">
          <ProblemBanner title="Не удалось загрузить список врачей" detail="Проверьте соединение и повторите попытку." errorCode="INTERNAL" />
        </div>
      ) : null}
      {result.ok && result.doctors.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Врачи не найдены" description="Измените фильтры поиска." />
        </div>
      ) : null}
      {result.ok && result.doctors.length > 0 ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {result.doctors.map((d) => (
            <li key={d.id} className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="font-semibold">{d.name}</p>
              <p className="text-sm text-[var(--muted-foreground)]">{d.specialty}</p>
              <Link href={`/doctors/${d.id}`} className="mt-2 inline-block text-sm underline">Профиль</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
