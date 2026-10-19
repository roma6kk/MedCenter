import { AppointmentList } from '@/components/appointments/appointment-list';
import { PatientShell } from '@/components/layout/patient-shell';

export default function AppointmentsPage(): React.JSX.Element {
  return (
    <PatientShell>
      <AppointmentList />
    </PatientShell>
  );
}
