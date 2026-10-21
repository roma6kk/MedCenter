'use client';

import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';

interface AdminPageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** The primary call to action (right-aligned, wraps below on a phone). */
  readonly action?: ReactNode;
}

/** The `h1` of an admin screen; it also names the browser tab, so the seven screens are told apart (WCAG 2.4.2). */
export function AdminPageHeader({ title, description, action }: AdminPageHeaderProps): ReactNode {
  useDocumentTitle(title);
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="serif text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
