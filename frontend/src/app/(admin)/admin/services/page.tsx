import { AdminPage } from '@/components/admin/shared/admin-page';
import { ServicesPanel } from '@/components/admin/services/services-panel';

export default function AdminServicesPage(): React.JSX.Element {
  return (
    <AdminPage>
      <ServicesPanel />
    </AdminPage>
  );
}
