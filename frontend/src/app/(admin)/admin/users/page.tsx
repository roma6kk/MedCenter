import { UsersPanel } from '@/components/admin/users/users-panel';
import { AdminPage } from '@/components/admin/shared/admin-page';

export default function AdminUsersPage(): React.JSX.Element {
  return (
    <AdminPage>
      <UsersPanel />
    </AdminPage>
  );
}
