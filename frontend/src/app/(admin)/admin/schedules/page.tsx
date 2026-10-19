import { AdminPage } from '@/components/admin/shared/admin-page';
import { SchedulesPanel } from '@/components/admin/schedules/schedules-panel';

export default function AdminSchedulesPage(): React.JSX.Element {
  return (
    <AdminPage>
      <SchedulesPanel />
    </AdminPage>
  );
}
