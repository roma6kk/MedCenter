import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { TerminologyImportPanel } from '@/components/admin/terminology-import-panel';

export default function AdminTerminologyPage(): React.JSX.Element {
  return (
    <StaffShell links={ADMIN_LINKS} title="Терминология">
      <h1 className="serif text-2xl font-bold">Терминология</h1>
      <div className="mt-4">
        <TerminologyImportPanel />
      </div>
    </StaffShell>
  );
}
