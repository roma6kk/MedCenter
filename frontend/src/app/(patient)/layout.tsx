import type { ReactNode } from 'react';
import { PatientShell } from '@/components/layout/patient-shell';
import { RoleGuard } from '@/components/layout/role-guard';

export default function PatientGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <RoleGuard required="PATIENT">
      <PatientShell>{children}</PatientShell>
    </RoleGuard>
  );
}
