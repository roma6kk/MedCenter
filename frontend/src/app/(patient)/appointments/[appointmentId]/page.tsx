import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AppointmentDetailView } from '@/components/appointments/appointment-detail-view';

export const metadata: Metadata = pageMetadata('appointments.detailTitle');

export default async function AppointmentDetailPage({ params }: { readonly params: Promise<{ appointmentId: string }> }): Promise<React.JSX.Element> {
  const { appointmentId } = await params;
  return <AppointmentDetailView appointmentId={appointmentId} />;
}
