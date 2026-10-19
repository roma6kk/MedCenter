import { AdminPage } from '@/components/admin/shared/admin-page';
import { AnalyticsPanel } from '@/components/admin/analytics/analytics-panel';

export default function AdminAnalyticsPage(): React.JSX.Element {
  return (
    <AdminPage>
      <AnalyticsPanel />
    </AdminPage>
  );
}
