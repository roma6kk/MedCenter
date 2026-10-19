import { PatientShell } from '@/components/layout/patient-shell';
import { ProfileView } from '@/components/patient/profile-view';

export default function ProfilePage(): React.JSX.Element {
  return (
    <PatientShell>
      <ProfileView />
    </PatientShell>
  );
}
