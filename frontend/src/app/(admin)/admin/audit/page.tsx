import { AdminPage } from '@/components/admin/shared/admin-page';
import { AuditPanel } from '@/components/admin/audit/audit-panel';

export default function AdminAuditPage(): React.JSX.Element {
  return (
    <AdminPage>
      <AuditPanel />
    </AdminPage>
  );
}
