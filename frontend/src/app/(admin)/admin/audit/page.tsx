import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AuditPanel } from '@/components/admin/audit/audit-panel';

export const metadata: Metadata = pageMetadata('admin.audit.title');

export default function AdminAuditPage(): React.JSX.Element {
  return <AuditPanel />;
}
