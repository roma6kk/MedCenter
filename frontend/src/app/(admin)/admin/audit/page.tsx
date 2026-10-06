import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { AuditTable } from '@/components/admin/audit-table';

export default function AdminAuditPage(): React.JSX.Element {
  return (
    <StaffShell links={ADMIN_LINKS} title="Аудит">
      <h1 className="serif text-2xl font-bold">Аудит</h1>
      <div className="mt-4">
        <AuditTable />
      </div>
    </StaffShell>
  );
}
