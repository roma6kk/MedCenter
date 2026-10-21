'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeChip } from './code-chip';
import { errorMessageKey } from '@/lib/api/error-code-map';
import type { ErrorCode, ProblemDetails } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';

interface ProblemBannerProps {
  /** Preferred: the whole problem. The headline becomes the localized `errors.<errorCode>` text (server titles are English). */
  readonly problem?: ProblemDetails;
  /** Explicit headline; wins over the one derived from `problem` / `errorCode`. */
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

/** A request that never got a response (offline, DNS, aborted) carries status 0 and `INTERNAL` only as a stand-in code. */
function isOffline(problem: ProblemDetails | undefined): boolean {
  return problem?.status === 0;
}

function useProblemView(props: ProblemBannerProps): ProblemView {
  const t = useT();
  const { problem } = props;
  // A lost connection says so ("No connection to the server") instead of the "Internal error" its stand-in code stands for,
  // and shows no code chip: there is no server answer to name. This is also what the central error effect toasts for it.
  const offline: boolean = isOffline(problem) && props.errorCode === undefined;
  const errorCode: ErrorCode | undefined = offline ? undefined : props.errorCode ?? problem?.errorCode;
  const fallbackHeadline: string = offline ? t('errors.NETWORK') : errorCode === undefined ? problem?.title ?? '' : t(errorMessageKey(errorCode));
  // Field messages are shown next to the inputs; repeating the joined server text here would only add noise.
  const hasFieldErrors: boolean = (problem?.details?.length ?? 0) > 0;
  return {
    headline: props.title ?? fallbackHeadline,
    errorCode,
    detail: props.detail ?? (hasFieldErrors || offline ? undefined : problem?.detail),
    requestId: props.requestId ?? problem?.requestId,
    retryAfter: problem?.retryAfter,
  };
}

/** Copies the request id for support (frontend-design-spec §8). Clipboard access can be denied: the id stays visible. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable or permission denied: the id is still shown as text, the user can select it.
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
        className="mono min-h-[24px] text-xs underline"
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
    <div role="alert" data-testid="problem-banner" className="rounded-card border border-[var(--border)] bg-[var(--card)] p-4">
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
