import { AppointmentDetailView } from '@/components/appointments/appointment-detail-view';

export default async function AppointmentDetailPage({ params }: { readonly params: Promise<{ appointmentId: string }> }): Promise<React.JSX.Element> {
  const { appointmentId } = await params;
  return <AppointmentDetailView appointmentId={appointmentId} />;
}
