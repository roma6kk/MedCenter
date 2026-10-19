'use client';

import type { ReactNode } from 'react';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx, errorMessageKey } from '@/lib/api/error-code-map';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ForbiddenState, NotFoundState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';

interface QueryErrorStateProps {
  /** What a failed query threw: an `ApiError` carrying the RFC 7807 problem, or anything else. */
  readonly error: unknown;
  /** Names the missing thing for a 404 (and `COMPARTMENT_VIOLATION`, shown as 404 on purpose: BR-006). */
  readonly notFoundText: string;
  readonly onRetry?: () => void;
}

/**
 * The failure of a read as the errorCode → UX map (frontend-design-spec §5.4) wants it shown: not found and compartment
 * violations look the same, scope/role problems are `ForbiddenState`, everything else is a banner with the request id and a retry.
 */
export function QueryErrorState({ error, notFoundText, onRetry }: QueryErrorStateProps): ReactNode {
  const tCommon = useT('common');
  const tErrors = useT();
  if (!isApiError(error)) {
    return <ProblemBanner title={tErrors(errorMessageKey('INTERNAL'))} errorCode="INTERNAL" />;
  }
  const { kind } = errorCodeToUx(error.problem.errorCode);
  if (kind === 'not-found') return <NotFoundState title={notFoundText} />;
  if (kind === 'forbidden') return <ForbiddenState title={tErrors(errorMessageKey(error.problem.errorCode))} />;
  return (
    <div>
      <ProblemBanner problem={error.problem} />
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 min-h-[44px] rounded-[6px] border border-[var(--border)] px-4 py-2 text-sm">
          {tCommon('retry')}
        </button>
      ) : null}
    </div>
  );
}
