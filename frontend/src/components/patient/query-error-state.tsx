'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ForbiddenState, NotFoundState } from '@/components/feedback/states';
import { isApiError, type ApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx, errorMessageKey } from '@/lib/api/error-code-map';
import type { ProblemDetails } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';

interface QueryErrorStateProps {
  /** What a failed query threw: an `ApiError` carrying the RFC 7807 problem, or anything else. */
  readonly error: unknown;
  /**
   * Names the missing thing for a 404 and for `COMPARTMENT_VIOLATION`, which is shown as a 404 on purpose (BR-006).
   * Not needed when `embedded`; a page that is the missing record without it falls back to the generic "Not found" text.
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
  readonly onRetry?: () => void;
}

function isMissing(error: ApiError, badRequestIsNotFound: boolean): boolean {
  return errorCodeToUx(error.problem.errorCode).kind === 'not-found' || (badRequestIsNotFound && error.status === 400);
}

/** Whether a failed read means "this record does not exist for you" (404, foreign record, or a malformed id when asked). */
export function isMissingError(error: unknown, badRequestIsNotFound: boolean = false): boolean {
  return isApiError(error) && isMissing(error, badRequestIsNotFound);
}

/** A lost connection has no status or request id: it is told apart by `status` 0, its stand-in code is `INTERNAL`. */
function isOffline(problem: ProblemDetails): boolean {
  return problem.status === 0;
}

/**
 * A failed read or write as a banner. A lost connection says so ("No connection to the server") instead of the "Internal
 * error" its stand-in code stands for, which is also what the central error effect toasts for it.
 */
export function MutationProblem({ problem }: { readonly problem: ProblemDetails }): ReactNode {
  const t = useT();
  return isOffline(problem) ? <ProblemBanner title={t('errors.NETWORK')} /> : <ProblemBanner problem={problem} />;
}

function RetryButton({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  const t = useT('common');
  return (
    <button type="button" onClick={onRetry} className="mt-3 min-h-[44px] rounded-[6px] border border-[var(--border)] px-4 py-2 text-sm">
      {t('retry')}
    </button>
  );
}

/** In an embedded failure a missing record is "not found" without the code that told it apart from a foreign one (BR-006). */
function MissingBanner({ error }: { readonly error: ApiError }): ReactNode {
  const t = useT();
  return <ProblemBanner title={t(errorMessageKey('NOT_FOUND'))} errorCode="NOT_FOUND" requestId={error.problem.requestId} />;
}

function EmbeddedFailure({ error }: { readonly error: ApiError }): ReactNode {
  return isMissing(error, false) ? <MissingBanner error={error} /> : <MutationProblem problem={error.problem} />;
}

/**
 * A failed read as the errorCode → UX map (frontend-design-spec §5.4) wants it: not found and compartment violations look
 * identical, a scope or role problem is `ForbiddenState`, anything else is a banner with the request id and a retry.
 */
export function QueryErrorState({ error, notFoundText, notFoundHint, notFoundAction, badRequestIsNotFound = false, embedded = false, onRetry }: QueryErrorStateProps): ReactNode {
  const tErrors = useT();
  if (!isApiError(error)) return <ProblemBanner title={tErrors(errorMessageKey('INTERNAL'))} errorCode="INTERNAL" />;
  if (!embedded && isMissing(error, badRequestIsNotFound)) {
    return <NotFoundState title={notFoundText ?? tErrors(errorMessageKey('NOT_FOUND'))} description={notFoundHint} action={notFoundAction} />;
  }
  if (!embedded && errorCodeToUx(error.problem.errorCode).kind === 'forbidden') return <ForbiddenState title={tErrors(errorMessageKey(error.problem.errorCode))} />;
  return (
    <div>
      {embedded ? <EmbeddedFailure error={error} /> : <MutationProblem problem={error.problem} />}
      {onRetry ? <RetryButton onRetry={onRetry} /> : null}
    </div>
  );
}
