import type { ReactNode } from 'react';
import { PatientShell } from '@/components/layout/patient-shell';
import { RoleGuard } from '@/components/layout/role-guard';

/** One shell for every cabinet page: the header, the unread bell and the skip link stay mounted while the patient moves between sections. */
export default function PatientGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <RoleGuard required="PATIENT">
      <PatientShell>{children}</PatientShell>
    </RoleGuard>
  );
}
