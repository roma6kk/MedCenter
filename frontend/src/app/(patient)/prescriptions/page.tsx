import { PatientShell } from '@/components/layout/patient-shell';
import { PrescriptionList } from '@/components/patient/prescription-list';

export default function PrescriptionsPage(): React.JSX.Element {
  return (
    <PatientShell>
      <PrescriptionList />
    </PatientShell>
  );
}
