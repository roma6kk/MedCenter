import { AdminPage } from '@/components/admin/shared/admin-page';
import { TerminologyPanel } from '@/components/admin/terminology/terminology-panel';

export default function AdminTerminologyPage(): React.JSX.Element {
  return (
    <AdminPage>
      <TerminologyPanel />
    </AdminPage>
  );
}
