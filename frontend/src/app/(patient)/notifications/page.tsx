import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { NotificationCenter } from '@/components/patient/notification-center';

export const metadata: Metadata = pageMetadata('patient.notifications.title');

export default function NotificationsPage(): React.JSX.Element {
  return <NotificationCenter />;
}
