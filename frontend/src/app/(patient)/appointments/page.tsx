'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';
import { AppointmentCard, type Appointment } from '@/components/appointments/appointment-card';
import { CancelAppointmentDialog } from '@/components/appointments/cancel-appointment-dialog';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { ProblemBanner } from '@/components/feedback/problem-banner';

export default function AppointmentsPage(): React.JSX.Element {
  const { data, isPending, isError } = useQuery({
    queryKey: ['appointments', 'mine'],
    queryFn: () => apiFetch<{ items: Appointment[] }>('/api/v1/me/appointments'),
    staleTime: 30_000,
  });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Мои записи</h1>
      <div className="mt-4 grid gap-3">
        {isPending ? <TableSkeleton /> : null}
        {isError ? <ProblemBanner title="Не удалось загрузить записи" errorCode="INTERNAL" /> : null}
        {data && data.items.length === 0 ? <EmptyState title="Нет записей" description="Запишитесь на приём." /> : null}
        {data?.items.map((a) => (
          <div key={a.id}>
            <AppointmentCard appointment={a} />
            {a.status === 'booked' ? <div className="mt-2"><CancelAppointmentDialog appointmentId={a.id} /></div> : null}
          </div>
        ))}
      </div>
    </PatientShell>
  );
}
