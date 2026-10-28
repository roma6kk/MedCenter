import { Suspense } from 'react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { AnalyticsPanel } from '@/components/admin/analytics/analytics-panel';

export const metadata: Metadata = pageMetadata('admin.analytics.title');

export default function AdminAnalyticsPage(): React.JSX.Element {
  // `useSearchParams` (the period in the address) needs a Suspense boundary above it for the static shell to build.
  return (
    <Suspense fallback={null}>
      <AnalyticsPanel />
    </Suspense>
  );
}
