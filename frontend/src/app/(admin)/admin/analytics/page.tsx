import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AnalyticsPanel } from '@/components/admin/analytics/analytics-panel';

export const metadata: Metadata = pageMetadata('admin.analytics.title');

export default function AdminAnalyticsPage(): React.JSX.Element {
  return <AnalyticsPanel />;
}
