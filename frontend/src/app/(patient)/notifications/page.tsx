import { PatientShell } from '@/components/layout/patient-shell';
import { NotificationCenter } from '@/components/patient/notification-center';

export default function NotificationsPage(): React.JSX.Element {
  return (
    <PatientShell>
      <NotificationCenter />
    </PatientShell>
  );
}
