'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { logout } from '@/lib/auth/session-client';
import { useT } from '@/lib/i18n/use-t';

/** Ends the session (revokes the refresh token server-side) and returns to the login screen. */
export function LogoutButton(): ReactNode {
  const t = useT('layout');
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async (): Promise<void> => {
    setIsPending(true);
    await logout();
  };

  return (
    <button
      type="button"
      disabled={isPending}
      aria-busy={isPending}
      onClick={() => void handleLogout()}
      className="min-h-[44px] rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--secondary)] disabled:opacity-50"
    >
      {isPending ? t('loggingOut') : t('logout')}
    </button>
  );
}
