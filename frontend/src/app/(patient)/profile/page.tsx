import { redirect } from 'next/navigation';

/** The old address of the cabinet's home (B6): bookmarks and links keep working. */
export default function ProfilePage(): never {
  redirect('/home');
}
