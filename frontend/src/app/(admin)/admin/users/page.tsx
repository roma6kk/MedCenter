import { Suspense } from 'react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { UsersPanel } from '@/components/admin/users/users-panel';

export const metadata: Metadata = pageMetadata('admin.users.title');

export default function AdminUsersPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <UsersPanel />
    </Suspense>
  );
}
