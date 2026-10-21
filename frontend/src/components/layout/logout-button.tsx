'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
    <Button variant="secondary" disabled={isPending} aria-busy={isPending} onClick={() => void handleLogout()} className="font-medium">
      {isPending ? t('loggingOut') : t('logout')}
    </Button>
  );
}
