'use client';

import type { ReactNode } from 'react';
import { ADMIN_LINKS, StaffShell } from '@/components/layout/staff-shell';

/** The staff shell with the admin navigation; the route pages stay server components and only hand it their panel. */
export function AdminPage({ children }: { readonly children: ReactNode }): ReactNode {
  return <StaffShell links={ADMIN_LINKS}>{children}</StaffShell>;
}
