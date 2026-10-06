'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';
import { CodeChip } from '@/components/feedback/code-chip';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';

interface HistoryItem { id: string; date: string; diagnosis: string; }

export default function HistoryPage(): React.JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['patientHistory', 'me'],
    queryFn: () => apiFetch<{ items: HistoryItem[] }>('/api/v1/me/history'),
  });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">История</h1>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : null}
      {data && data.items.length === 0 ? <EmptyState title="История пуста" /> : null}
      <ol className="mt-4 space-y-3 border-l border-[var(--border)] pl-4">
        {data?.items.map((item) => (
          <li key={item.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--primary)]" />
            <p className="text-sm text-[var(--muted-foreground)]">{new Date(item.date).toLocaleDateString('ru-BY', { timeZone: 'Europe/Minsk' })}</p>
            <CodeChip code={item.diagnosis} system="https://fhir.by/CodeSystem/InternClassificDiseases10" />
          </li>
        ))}
      </ol>
    </PatientShell>
  );
}
