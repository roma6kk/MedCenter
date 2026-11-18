import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/layout/role-guard';
import { ADMIN_LINKS, StaffShell } from '@/components/layout/staff-shell';

export default function AdminGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <RoleGuard required="ADMIN">
      <StaffShell links={ADMIN_LINKS}>{children}</StaffShell>
    </RoleGuard>
  );
}
