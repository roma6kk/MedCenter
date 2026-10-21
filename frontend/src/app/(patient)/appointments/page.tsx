import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AppointmentList } from '@/components/appointments/appointment-list';

export const metadata: Metadata = pageMetadata('appointments.title');

export default function AppointmentsPage(): React.JSX.Element {
  return <AppointmentList />;
}
