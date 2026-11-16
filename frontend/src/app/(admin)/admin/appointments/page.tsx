import { Suspense } from 'react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AdminAppointmentsPanel } from '@/components/admin/appointments/admin-appointments-panel';

export const metadata: Metadata = pageMetadata('admin.appointments.title');

export default function AdminAppointmentsPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <AdminAppointmentsPanel />
    </Suspense>
  );
}
