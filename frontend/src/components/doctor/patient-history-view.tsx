'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, DOCTOR_LINKS } from '@/components/layout/staff-shell';
import { CodeChip } from '@/components/feedback/code-chip';
import { TableSkeleton } from '@/components/feedback/states';

interface HistoryItem { readonly id: string; readonly date: string; readonly diagnosis: string; }

export function PatientHistoryView({ patientId }: { readonly patientId: string }): React.JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['patientHistory', patientId],
    queryFn: () => apiFetch<{ items: HistoryItem[] }>(`/api/v1/patients/${patientId}/history`),
  });
  return (
    <StaffShell links={DOCTOR_LINKS} title="Карта пациента">
      <h1 className="serif text-2xl font-bold">Пациент</h1>
      <p className="mono mt-1 text-sm">{patientId}</p>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : (
        <ol className="mt-4 space-y-3 border-l border-[var(--border)] pl-4">
          {data?.items.map((item) => <li key={item.id}><p className="text-sm">{item.date}</p><CodeChip code={item.diagnosis} /></li>)}
        </ol>
      )}
    </StaffShell>
  );
}
