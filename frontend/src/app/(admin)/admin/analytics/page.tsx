import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';

export default function AdminAnalyticsPage(): React.JSX.Element {
  return (
    <StaffShell links={ADMIN_LINKS} title="Аналитика">
      <h1 className="serif text-2xl font-bold">Аналитика</h1>
      <div className="mt-4">
        <AnalyticsDashboard />
      </div>
    </StaffShell>
  );
}
