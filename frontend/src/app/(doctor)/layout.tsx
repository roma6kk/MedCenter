import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/layout/role-guard';
import { DOCTOR_LINKS, StaffShell } from '@/components/layout/staff-shell';
import { Providers } from '@/components/providers';

/** One shell for every doctor page: it stays mounted while the doctor moves between the journal, a visit and a patient card. */
export default function DoctorGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Providers>
      <RoleGuard required="DOCTOR">
        <StaffShell links={DOCTOR_LINKS}>{children}</StaffShell>
      </RoleGuard>
    </Providers>
  );
}
