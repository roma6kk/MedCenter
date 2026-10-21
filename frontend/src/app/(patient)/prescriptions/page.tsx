import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { PrescriptionList } from '@/components/patient/prescription-list';

export const metadata: Metadata = pageMetadata('patient.prescriptions.title');

export default function PrescriptionsPage(): React.JSX.Element {
  return <PrescriptionList />;
}
