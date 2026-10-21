import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { HistoryTimeline } from '@/components/patient/history-timeline';

export const metadata: Metadata = pageMetadata('patient.history.title');

export default function HistoryPage(): React.JSX.Element {
  return <HistoryTimeline />;
}
