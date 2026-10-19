import { AdminPage } from '@/components/admin/shared/admin-page';
import { RoomsPanel } from '@/components/admin/rooms/rooms-panel';

export default function AdminRoomsPage(): React.JSX.Element {
  return (
    <AdminPage>
      <RoomsPanel />
    </AdminPage>
  );
}
