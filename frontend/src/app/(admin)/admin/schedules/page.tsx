import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { SchedulesPanel } from '@/components/admin/schedules/schedules-panel';

export const metadata: Metadata = pageMetadata('admin.schedules.title');

export default function AdminSchedulesPage(): React.JSX.Element {
  return <SchedulesPanel />;
}
