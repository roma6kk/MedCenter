'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, DOCTOR_LINKS } from '@/components/layout/staff-shell';
import { EncounterCompleteForm } from '@/components/doctor/encounter-complete-form';
import { ProblemBanner } from '@/components/feedback/problem-banner';

export function EncounterView({ encounterId }: { readonly encounterId: string }): React.JSX.Element {
  const { data } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: () => apiFetch<{ status: string }>(`/api/v1/encounters/${encounterId}`),
  });
  const finished = data?.status === 'finished';
  return (
    <StaffShell links={DOCTOR_LINKS} title="Приём">
      <h1 className="serif text-2xl font-bold">Приём {encounterId}</h1>
      {finished ? <div className="mt-3"><ProblemBanner title="Приём завершён" detail="Форма доступна только для чтения." /></div> : null}
      <div className="mt-4"><EncounterCompleteForm encounterId={encounterId} readOnly={finished} /></div>
    </StaffShell>
  );
}
