import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { parseMedcardTab } from '@/components/patient/medcard-tab';
import { MedicalRecord } from '@/components/patient/medical-record';

export const metadata: Metadata = pageMetadata('medcard.title');

interface MedcardPageProps {
  readonly searchParams?: Promise<{ tab?: string | string[] }>;
}

export default async function MedcardPage({ searchParams }: MedcardPageProps): Promise<React.JSX.Element> {
  const tab: string | string[] | undefined = (await searchParams)?.tab;
  return <MedicalRecord initialTab={parseMedcardTab(Array.isArray(tab) ? tab[0] : tab)} />;
}
