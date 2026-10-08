import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { RoleGuard } from '@/components/layout/role-guard';

export default function AdminGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Providers>
      <RoleGuard required="ADMIN">{children}</RoleGuard>
    </Providers>
  );
}
