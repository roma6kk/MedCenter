import { PatientHistoryView } from '@/components/doctor/patient-history-view';

export default async function DoctorPatientPage({ params }: { readonly params: Promise<{ patientId: string }> }): Promise<React.JSX.Element> {
  const { patientId } = await params;
  return <PatientHistoryView patientId={patientId} />;
}
