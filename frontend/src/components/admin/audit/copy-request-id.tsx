'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

/** Writes to the clipboard; it can be denied (insecure origin, no permission): the id stays selectable as text. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable or denied: nothing to recover, the id is still readable on screen.
    return false;
  }
}

const SHORT_ID_LENGTH = 8;
/** How long «Скопировано» stays: long enough to be read and announced, short enough not to outlive the action. */
export const COPIED_MESSAGE_MS = 2500;

/** `3882171c-26eb-…` → `3882171c…`: enough to tell requests apart on screen; the button copies the whole id. */
function shortId(requestId: string): string {
  return requestId.length > SHORT_ID_LENGTH ? `${requestId.slice(0, SHORT_ID_LENGTH)}…` : requestId;
}

/** `true` for `COPIED_MESSAGE_MS` after a successful copy: the confirmation is not a permanent part of the row. */
function useCopiedFlag(): readonly [boolean, (isCopied: boolean) => void] {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return undefined;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);
  return [isCopied, setIsCopied];
}

/**
 * The `requestId` of an audit event with a «copy» button. An event written by a service that does not record the request id
 * has an empty one: there is nothing to copy, so no button is rendered, only a dash. The confirmation is a live region that
 * exists only after a copy, so a page of 20 events has no 20 empty regions.
 */
export function CopyRequestId({ requestId }: { readonly requestId: string }): ReactNode {
  const t = useT('admin.audit');
  const tCommon = useT('common');
  const [isCopied, setIsCopied] = useCopiedFlag();
  if (requestId === '') {
    return (
      <span data-testid="no-request-id" className="text-[var(--muted-foreground)]">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('noRequestId')}</span>
      </span>
    );
  }
  const handleCopy = async (): Promise<void> => setIsCopied(await copyText(requestId));
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span title={requestId} className="mono text-xs">{shortId(requestId)}</span>
      <button type="button" onClick={() => void handleCopy()} aria-label={t('copyAria', { requestId })} className="min-h-[44px] rounded-control px-2 text-xs underline underline-offset-2 hover:text-[var(--primary)]">
        {tCommon('copy')}
      </button>
      {isCopied ? <span role="status" className="text-xs text-[var(--muted-foreground)]">{tCommon('copied')}</span> : null}
    </span>
  );
}
