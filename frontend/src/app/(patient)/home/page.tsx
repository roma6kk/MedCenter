import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { HomeView } from '@/components/patient/home-view';

export const metadata: Metadata = pageMetadata('patientHome.title');

export default function HomePage(): React.JSX.Element {
  return <HomeView />;
}
