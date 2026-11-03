'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { loadSession } from '@/lib/auth/session-client';
import { useT } from '@/lib/i18n/use-t';

/**
 * What a route group shows when the session could not be loaded because auth-service did not answer (a restart, a rate
 * limit, a dropped link). The refresh cookie is probably still good, so the visitor is offered a retry instead of the
 * sign-in page, which would lead to the same unreachable service. A successful retry fills the session store and the guard
 * lets the page through.
 */
export function SessionUnavailable(): ReactNode {
  const t = useT('auth.login');
  const tCommon = useT('common');
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = async (): Promise<void> => {
    if (isRetrying) return;
    setIsRetrying(true);
    await loadSession();
    setIsRetrying(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-10">
      <div data-testid="session-unavailable" className="w-full rounded-panel border border-border bg-card p-8 sm:p-10">
        <ProblemBanner title={t('unavailable')} />
        <div className="mt-6 flex justify-center">
          {/* aria-disabled, not disabled: a closed control keeps the keyboard focus while the retry runs. */}
          <Button size="lg" onClick={() => void retry()} aria-disabled={isRetrying || undefined}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {isRetrying ? tCommon('retrying') : tCommon('retry')}
          </Button>
        </div>
        <span role="status" className="sr-only">{isRetrying ? tCommon('retrying') : ''}</span>
      </div>
    </main>
  );
}
