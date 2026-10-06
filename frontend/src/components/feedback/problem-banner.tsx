'use client';

import type { ReactNode } from 'react';
import { CodeChip } from './code-chip';
import type { ErrorCode } from '@/lib/api/problem';

interface ProblemBannerProps {
  readonly title: string;
  readonly detail?: string;
  readonly errorCode?: ErrorCode;
  readonly requestId?: string;
}

export function ProblemBanner({ title, detail, errorCode, requestId }: ProblemBannerProps): ReactNode {
  const copyRequestId = async (): Promise<void> => {
    if (requestId) await navigator.clipboard.writeText(requestId);
  };

  return (
    <div role="alert" data-testid="problem-banner" className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="font-semibold">{title}</p>
      {detail ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{detail}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {errorCode ? <CodeChip code={errorCode} /> : null}
        {requestId ? (
          <button type="button" onClick={() => void copyRequestId()} className="mono text-xs underline" data-testid="copy-request-id">
            {requestId}
          </button>
        ) : null}
      </div>
    </div>
  );
}
