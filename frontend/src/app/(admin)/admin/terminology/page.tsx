import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { TerminologyPanel } from '@/components/admin/terminology/terminology-panel';

export const metadata: Metadata = pageMetadata('admin.terminology.title');

export default function AdminTerminologyPage(): React.JSX.Element {
  return <TerminologyPanel />;
}
