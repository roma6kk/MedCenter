import { redirect } from 'next/navigation';

/** `/admin` is the entry point of the admin area; the dashboard is its first screen (frontend-design-spec §1). */
export default function AdminIndexPage(): never {
  redirect('/admin/analytics');
}
