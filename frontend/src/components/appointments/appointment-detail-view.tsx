'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';
import { AppointmentCard, type Appointment } from '@/components/appointments/appointment-card';
import { NotFoundState } from '@/components/feedback/states';
import { ProblemBanner } from '@/components/feedback/problem-banner';

export function AppointmentDetailView({ appointmentId }: { readonly appointmentId: string }): React.JSX.Element {
  const { data, isPending, isError } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => apiFetch<Appointment>(`/api/v1/me/appointments/${appointmentId}`),
  });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Запись</h1>
      <div className="mt-4">
        {isPending ? <p>Загрузка…</p> : null}
        {isError ? <NotFoundState title="Запись не найдена" /> : null}
        {!isPending && !isError && !data ? <ProblemBanner title="Не удалось загрузить запись" errorCode="INTERNAL" /> : null}
        {data ? <AppointmentCard appointment={data} /> : null}
      </div>
    </PatientShell>
  );
}
