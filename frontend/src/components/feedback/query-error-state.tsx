'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ForbiddenState, NotFoundState } from '@/components/feedback/states';
import { isApiError, type ApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx, errorMessageKey } from '@/lib/api/error-code-map';
import type { ProblemDetails } from '@/lib/api/problem';
import { useFailedRead, type ReadState } from '@/lib/api/use-failed-read';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';

interface QueryErrorStateProps {
  readonly error: unknown;
  // COMPARTMENT_VIOLATION is shown as a 404 on purpose: a foreign record must be indistinguishable from a missing one (BR-006).
  readonly notFoundText?: string;
  readonly notFoundHint?: string;
  readonly notFoundAction?: ReactNode;
  readonly badRequestIsNotFound?: boolean;
  readonly embedded?: boolean;
  readonly isRetrying?: boolean;
  readonly onRetry?: () => void;
}

function problemOf(error: unknown): ProblemDetails | null {
  return isApiError(error) ? error.problem : null;
}

function isMissing(error: ApiError, badRequestIsNotFound: boolean): boolean {
  return errorCodeToUx(error.problem.errorCode).kind === 'not-found' || (badRequestIsNotFound && error.status === 400);
}

export function isMissingError(error: unknown, badRequestIsNotFound: boolean = false): boolean {
  return isApiError(error) && isMissing(error, badRequestIsNotFound);
}

const FOCUS_REGION = '[role="tabpanel"], main, [tabindex="-1"]';

function useRegionFocusAfterRetry(): (button: HTMLElement) => void {
  const region = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      if (region.current !== null && document.activeElement === document.body) region.current.focus();
    },
    [],
  );
  return (button) => {
    region.current = button.closest<HTMLElement>(FOCUS_REGION);
  };
}

interface RetryButtonProps {
  readonly problem: ProblemDetails | null;
  readonly isRetrying: boolean;
  readonly onRetry: () => void;
}

// aria-disabled, not disabled: a closed control keeps the keyboard focus; after a 429 it counts down Retry-After.
function RetryButton({ problem, isRetrying, onRetry }: RetryButtonProps): ReactNode {
  const t = useT('common');
  const tProblem = useT('feedback.problem');
  const cooldown: number = useRetryCooldown(problem);
  const rememberRegion = useRegionFocusAfterRetry();
  const isClosed: boolean = isRetrying || cooldown > 0;
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (isClosed) return;
    rememberRegion(event.currentTarget);
    onRetry();
  };
  const label: string = isRetrying ? t('retrying') : cooldown > 0 ? tProblem('retryAfter', { seconds: cooldown }) : t('retry');
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-disabled={isClosed || undefined}
        className="mt-3 min-h-[44px] rounded-control border border-[var(--border)] px-4 py-2 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        {label}
      </button>
      <span role="status" className="sr-only">{isRetrying ? t('retrying') : ''}</span>
    </>
  );
}

function MissingBanner({ error, text }: { readonly error: ApiError; readonly text: string | undefined }): ReactNode {
  const t = useT();
  return <ProblemBanner title={text ?? t(errorMessageKey('NOT_FOUND'))} errorCode="NOT_FOUND" requestId={error.problem.requestId} />;
}

function FailureBanner({ error, embedded, notFoundText }: { readonly error: unknown; readonly embedded: boolean; readonly notFoundText: string | undefined }): ReactNode {
  if (!isApiError(error)) return <ProblemBanner errorCode="INTERNAL" />;
  if (embedded && isMissing(error, false)) return <MissingBanner error={error} text={notFoundText} />;
  return <ProblemBanner problem={error.problem} />;
}

export function QueryErrorState(props: QueryErrorStateProps): ReactNode {
  const { error, notFoundText, notFoundHint, notFoundAction, badRequestIsNotFound = false, embedded = false, isRetrying = false, onRetry } = props;
  const tErrors = useT();
  if (isApiError(error) && !embedded) {
    if (isMissing(error, badRequestIsNotFound)) {
      return <NotFoundState title={notFoundText ?? tErrors(errorMessageKey('NOT_FOUND'))} description={notFoundHint} action={notFoundAction} />;
    }
    if (errorCodeToUx(error.problem.errorCode).kind === 'forbidden') return <ForbiddenState title={tErrors(errorMessageKey(error.problem.errorCode))} />;
  }
  return (
    <div>
      <FailureBanner error={error} embedded={embedded} notFoundText={notFoundText} />
      {onRetry ? <RetryButton problem={problemOf(error)} isRetrying={isRetrying} onRetry={onRetry} /> : null}
    </div>
  );
}

type QueryFailureProps = Omit<QueryErrorStateProps, 'error' | 'isRetrying' | 'onRetry'> & {
  readonly query: ReadState & { readonly refetch: () => unknown };
  readonly pending: ReactNode;
};

export function QueryFailure({ query, pending, ...stateProps }: QueryFailureProps): ReactNode {
  const failure = useFailedRead(query);
  if (failure === null) return pending;
  return <QueryErrorState {...stateProps} error={failure.error} isRetrying={failure.isRetrying} onRetry={() => void query.refetch()} />;
}
