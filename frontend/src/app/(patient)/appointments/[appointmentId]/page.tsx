import { AppointmentDetailView } from '@/components/appointments/appointment-detail-view';
import { PatientShell } from '@/components/layout/patient-shell';

export default async function AppointmentDetailPage({ params }: { readonly params: Promise<{ appointmentId: string }> }): Promise<React.JSX.Element> {
  const { appointmentId } = await params;
  return (
    <PatientShell>
      <AppointmentDetailView appointmentId={appointmentId} />
    </PatientShell>
  );
}
