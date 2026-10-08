import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { RoleGuard } from '@/components/layout/role-guard';

export default function DoctorGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Providers>
      <RoleGuard required="DOCTOR">{children}</RoleGuard>
    </Providers>
  );
}
