'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

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
export const COPIED_MESSAGE_MS = 2500;

function shortId(requestId: string): string {
  return requestId.length > SHORT_ID_LENGTH ? `${requestId.slice(0, SHORT_ID_LENGTH)}…` : requestId;
}

function useCopiedFlag(): readonly [boolean, (isCopied: boolean) => void] {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return undefined;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);
  return [isCopied, setIsCopied];
}

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
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span title={requestId} className="mono text-xs">{shortId(requestId)}</span>
      <button type="button" onClick={() => void handleCopy()} aria-label={t('copyAria', { requestId })} className="min-h-[44px] rounded-control px-2 text-xs underline underline-offset-2 hover:text-[var(--primary)]">
        {tCommon('copy')}
      </button>
      {isCopied ? <span role="status" className="text-xs text-[var(--muted-foreground)]">{tCommon('copied')}</span> : null}
    </span>
  );
}
