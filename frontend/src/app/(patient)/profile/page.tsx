import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { ProfileView } from '@/components/patient/profile-view';

export const metadata: Metadata = pageMetadata('patient.profile.title');

export default function ProfilePage(): React.JSX.Element {
  return <ProfileView />;
}
