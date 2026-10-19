'use client';

import type { ReactNode } from 'react';
import { isApiError } from '@/lib/api/api-fetch';
import { errorMessageKey } from '@/lib/api/error-code-map';
import type { ErrorCode } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';

interface InlineProblemProps {
  readonly error: unknown;
  /** Texts that replace the catalogue message for particular codes (e.g. a more helpful one for a 409 in this context). */
  readonly overrides?: Partial<Readonly<Record<ErrorCode, string>>>;
}

/** A failed action in a table cell or a button group: one localized sentence and the request id for support, announced at once. */
export function InlineProblem({ error, overrides }: InlineProblemProps): ReactNode {
  const tErrors = useT();
  const code: ErrorCode = isApiError(error) ? error.problem.errorCode : 'INTERNAL';
  const requestId: string | undefined = isApiError(error) ? error.problem.requestId : undefined;
  return (
    <span role="alert" className="text-sm text-[var(--destructive)]">
      {overrides?.[code] ?? tErrors(errorMessageKey(code))}
      {requestId ? <span className="mono ml-1 text-xs text-[var(--muted-foreground)]">{requestId}</span> : null}
    </span>
  );
}
