'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';
import { CodeChip } from '@/components/feedback/code-chip';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';

interface Prescription { id: string; atcCode: string; dosageText: string; note?: string; }

export default function PrescriptionsPage(): React.JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['prescriptions', 'mine'],
    queryFn: () => apiFetch<{ items: Prescription[] }>('/api/v1/me/prescriptions'),
  });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Назначения</h1>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : null}
      {data && data.items.length === 0 ? <EmptyState title="Нет назначений" /> : null}
      <div className="mt-4 grid gap-3">
        {data?.items.map((p) => (
          <article key={p.id} className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
            <CodeChip code={p.atcCode} system="http://www.whocc.no/atc" />
            <p className="mt-2 text-sm">{p.dosageText}</p>
            {p.note ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{p.note}</p> : null}
            <button type="button" onClick={() => window.print()} className="no-print mt-2 text-sm underline">Печать</button>
          </article>
        ))}
      </div>
    </PatientShell>
  );
}
