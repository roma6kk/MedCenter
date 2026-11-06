'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SessionUnavailable } from '@/components/layout/session-unavailable';
import { resolveRoleAccess } from '@/lib/auth/role-access';
import { currentReturnTo } from '@/lib/auth/session-client';
import { useSessionStore, type UserRole } from '@/store/use-session-store';

// Children are not mounted until access is decided, so a wrong-role user never fires the group queries.
export function RoleGuard({ required, children }: { readonly required: UserRole; readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  const hydrated = useSessionStore((state) => state.hydrated);
  const role = useSessionStore((state) => state.role);
  const unavailable = useSessionStore((state) => state.unavailable);
  const access = resolveRoleAccess(required, { hydrated, role, unavailable });

  useEffect(() => {
    if (access === 'forbidden') router.replace('/403');
    // The address bar, not usePathname(): that has no query, and a chosen day or analytics period lives there.
    if (access === 'login') router.replace(`/login?returnTo=${encodeURIComponent(currentReturnTo())}`);
  }, [access, router]);

  if (access === 'unavailable') return <SessionUnavailable />;
  return access === 'allow' ? children : null;
}
