import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { formatMinskDateTime } from '@/lib/utils';

export interface Appointment { id: string; start: string; status: StampStatus; doctorName: string; serviceName: string; }

export function AppointmentCard({ appointment }: { readonly appointment: Appointment }): React.JSX.Element {
  return (
    <article className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="serif text-[20px] font-semibold">{formatMinskDateTime(appointment.start)}</p>
        <StampBadge status={appointment.status} />
      </div>
      <p className="mt-1 text-sm">{appointment.doctorName} · {appointment.serviceName}</p>
    </article>
  );
}
