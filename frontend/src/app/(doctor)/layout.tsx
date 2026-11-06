import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/layout/role-guard';
import { DOCTOR_LINKS, StaffShell } from '@/components/layout/staff-shell';

export default function DoctorGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <RoleGuard required="DOCTOR">
      <StaffShell links={DOCTOR_LINKS}>{children}</StaffShell>
    </RoleGuard>
  );
}
