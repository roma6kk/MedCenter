'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { resolveRoleAccess } from '@/lib/auth/role-access';
import { useSessionStore, type UserRole } from '@/store/use-session-store';

/**
 * Renders a route group only for its role. Children are not mounted until access is
 * decided, so a wrong-role user never fires the group's API queries.
 */
export function RoleGuard({ required, children }: { readonly required: UserRole; readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSessionStore((state) => state.hydrated);
  const role = useSessionStore((state) => state.role);
  const access = resolveRoleAccess(required, { hydrated, role });

  useEffect(() => {
    if (access === 'forbidden') router.replace('/403');
    if (access === 'login') router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [access, pathname, router]);

  return access === 'allow' ? children : null;
}
