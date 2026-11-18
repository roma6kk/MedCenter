'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeChip } from './code-chip';
import { errorMessageKey } from '@/lib/api/error-code-map';
import type { ErrorCode, ProblemDetails } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';

interface ProblemBannerProps {
  readonly problem?: ProblemDetails;
  readonly title?: string;
  readonly detail?: string;
  readonly errorCode?: ErrorCode;
  readonly requestId?: string;
}

interface ProblemView {
  readonly headline: string;
  readonly detail: string | undefined;
  readonly errorCode: ErrorCode | undefined;
  readonly requestId: string | undefined;
  readonly retryAfter: number | undefined;
}

function useProblemView(props: ProblemBannerProps): ProblemView {
  const t = useT();
  const { problem } = props;
  const offline: boolean = problem?.status === 0 && props.errorCode === undefined;
  const errorCode: ErrorCode | undefined = offline ? undefined : props.errorCode ?? problem?.errorCode;
  const fallbackHeadline: string = offline ? t('errors.NETWORK') : errorCode === undefined ? problem?.title ?? '' : t(errorMessageKey(errorCode));
  const hasFieldErrors: boolean = (problem?.details?.length ?? 0) > 0;
  // A 500 shows only the headline and request id: the server withholds the cause on purpose (OWASP A05/A09). 502/503 keep their detail.
  const isInternal: boolean = errorCode === 'INTERNAL' && problem?.status === 500;
  return {
    headline: props.title ?? fallbackHeadline,
    errorCode,
    detail: props.detail ?? (hasFieldErrors || offline || isInternal ? undefined : problem?.detail),
    requestId: props.requestId ?? problem?.requestId,
    retryAfter: problem?.retryAfter,
  };
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard denied or unavailable: the id stays visible as text
    return false;
  }
}

function RequestIdButton({ requestId }: { readonly requestId: string }): ReactNode {
  const t = useT('feedback.problem');
  const tCommon = useT('common');
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = async (): Promise<void> => setIsCopied(await copyToClipboard(requestId));
  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={t('copyRequestId', { requestId })}
        className="mono inline-flex min-h-[44px] items-center text-xs underline"
        data-testid="copy-request-id"
      >
        {requestId}
      </button>
      <span role="status" className="text-xs text-[var(--muted-foreground)]">{isCopied ? tCommon('copied') : ''}</span>
    </>
  );
}

export function ProblemBanner(props: ProblemBannerProps): ReactNode {
  const t = useT('feedback.problem');
  const { headline, detail, errorCode, requestId, retryAfter } = useProblemView(props);
  return (
    <div role="alert" data-testid="problem-banner" className="rounded-card border border-transparent bg-destructive-soft p-4">
      <p className="font-semibold">{headline}</p>
      {detail ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{detail}</p> : null}
      {retryAfter !== undefined && retryAfter > 0 ? (
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t('retryAfter', { seconds: retryAfter })}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {errorCode ? <CodeChip code={errorCode} /> : null}
        {requestId ? <RequestIdButton requestId={requestId} /> : null}
      </div>
    </div>
  );
}
