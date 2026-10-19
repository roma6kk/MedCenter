import type { ReactNode } from 'react';
import { PatientCardView } from '@/components/doctor/patient-card-view';

export default async function DoctorPatientPage({ params }: { readonly params: Promise<{ patientId: string }> }): Promise<ReactNode> {
  const { patientId } = await params;
  return <PatientCardView patientId={patientId} />;
}
