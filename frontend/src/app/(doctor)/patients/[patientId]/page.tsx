import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { PatientCardView } from '@/components/doctor/patient-card-view';
import { pageMetadata } from '@/lib/i18n/page-metadata';

/** A patient's name never goes into the tab title: it would show up in the history and the window list. */
export const metadata: Metadata = pageMetadata('doctor.patient.cardLabel');

export default async function DoctorPatientPage({ params }: { readonly params: Promise<{ patientId: string }> }): Promise<ReactNode> {
  const { patientId } = await params;
  return <PatientCardView patientId={patientId} />;
}
