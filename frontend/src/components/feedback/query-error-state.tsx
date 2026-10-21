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
  /** What a failed query threw: an `ApiError` carrying the RFC 7807 problem, or anything else. */
  readonly error: unknown;
  /**
   * Names the missing thing for a 404 and for `COMPARTMENT_VIOLATION`, which is shown as a 404 on purpose (BR-006).
   * A page that is the missing record without it falls back to the generic "Not found" text.
   */
  readonly notFoundText?: string;
  readonly notFoundHint?: string;
  /** What the user can do next from the not-found screen (a link back to the list). */
  readonly notFoundAction?: ReactNode;
  /** A malformed id in the address (400) cannot name an existing record, so a detail page shows it as not found too. */
  readonly badRequestIsNotFound?: boolean;
  /**
   * The failure sits inside a page that has its own heading (a list, a card). The not-found and forbidden screens bring an
   * `<h1>` of their own, so here they become a plain banner with a retry: one heading per page, and no "history is empty"
   * wording for what is an error.
   */
  readonly embedded?: boolean;
  /** The read is being asked for again (`useFailedRead`): the banner stays and the button closes, keeping the focus. */
  readonly isRetrying?: boolean;
  readonly onRetry?: () => void;
}

function problemOf(error: unknown): ProblemDetails | null {
  return isApiError(error) ? error.problem : null;
}

function isMissing(error: ApiError, badRequestIsNotFound: boolean): boolean {
  return errorCodeToUx(error.problem.errorCode).kind === 'not-found' || (badRequestIsNotFound && error.status === 400);
}

/** Whether a failed read means "this record does not exist for you" (404, foreign record, or a malformed id when asked). */
export function isMissingError(error: unknown, badRequestIsNotFound: boolean = false): boolean {
  return isApiError(error) && isMissing(error, badRequestIsNotFound);
}

/** Where focus goes when the retried content replaces the banner (the button it sat on is gone): the nearest panel or the page's main region. */
const FOCUS_REGION = '[role="tabpanel"], main, [tabindex="-1"]';

/** Remembers the region around the button that asked for the retry and gives it focus if the button's banner goes away and focus fell to `<body>`. */
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

/**
 * «Повторить». While the read is repeated it says so and stays in the page (`aria-disabled`, not `disabled`: a closed
 * control keeps the keyboard focus); after a 429 it stays closed and counts the seconds of `Retry-After` (§5.4).
 */
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
        className="mt-3 min-h-[44px] rounded-[6px] border border-[var(--border)] px-4 py-2 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        {label}
      </button>
      <span role="status" className="sr-only">{isRetrying ? t('retrying') : ''}</span>
    </>
  );
}

/** A missing record inside a page is "not found" without the code that told it apart from a foreign one (BR-006). */
function MissingBanner({ error, text }: { readonly error: ApiError; readonly text: string | undefined }): ReactNode {
  const t = useT();
  return <ProblemBanner title={text ?? t(errorMessageKey('NOT_FOUND'))} errorCode="NOT_FOUND" requestId={error.problem.requestId} />;
}

function FailureBanner({ error, embedded, notFoundText }: { readonly error: unknown; readonly embedded: boolean; readonly notFoundText: string | undefined }): ReactNode {
  if (!isApiError(error)) return <ProblemBanner errorCode="INTERNAL" />;
  if (embedded && isMissing(error, false)) return <MissingBanner error={error} text={notFoundText} />;
  return <ProblemBanner problem={error.problem} />;
}

/**
 * A failed read as the errorCode → UX map (frontend-design-spec §5.4) wants it: not found and compartment violations look
 * identical, a scope or role problem is `ForbiddenState`, anything else is a banner with the request id and a retry.
 */
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
  /** What a read that has not failed (yet) shows: the skeleton. */
  readonly pending: ReactNode;
};

/**
 * What a screen shows for a read that has no data yet: the skeleton while it loads, the failure with «Повторить» when it
 * failed, and — on retry — the SAME failure with the button closed (`useFailedRead`), so the banner never flips to a
 * skeleton and focus stays where the user put it.
 */
export function QueryFailure({ query, pending, ...stateProps }: QueryFailureProps): ReactNode {
  const failure = useFailedRead(query);
  if (failure === null) return pending;
  return <QueryErrorState {...stateProps} error={failure.error} isRetrying={failure.isRetrying} onRetry={() => void query.refetch()} />;
}
