import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { ServicesPanel } from '@/components/admin/services/services-panel';

export const metadata: Metadata = pageMetadata('admin.services.title');

export default function AdminServicesPage(): React.JSX.Element {
  return <ServicesPanel />;
}
