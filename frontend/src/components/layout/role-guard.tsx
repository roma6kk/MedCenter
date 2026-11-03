'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SessionUnavailable } from '@/components/layout/session-unavailable';
import { resolveRoleAccess } from '@/lib/auth/role-access';
import { currentReturnTo } from '@/lib/auth/session-client';
import { useSessionStore, type UserRole } from '@/store/use-session-store';

/**
 * Renders a route group only for its role. Children are not mounted until access is
 * decided, so a wrong-role user never fires the group's API queries. When auth-service did not answer, nothing is known
 * about the visitor: a retry is shown, not the sign-in page.
 */
export function RoleGuard({ required, children }: { readonly required: UserRole; readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  const hydrated = useSessionStore((state) => state.hydrated);
  const role = useSessionStore((state) => state.role);
  const unavailable = useSessionStore((state) => state.unavailable);
  const access = resolveRoleAccess(required, { hydrated, role, unavailable });

  useEffect(() => {
    if (access === 'forbidden') router.replace('/403');
    // The address bar, not `usePathname()`: that has no query, and a doctor's chosen day or an analytics period lives there.
    if (access === 'login') router.replace(`/login?returnTo=${encodeURIComponent(currentReturnTo())}`);
  }, [access, router]);

  if (access === 'unavailable') return <SessionUnavailable />;
  return access === 'allow' ? children : null;
}
