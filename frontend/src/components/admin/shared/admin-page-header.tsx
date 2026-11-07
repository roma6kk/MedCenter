'use client';

import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';

interface AdminPageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function AdminPageHeader({ title, description, action }: AdminPageHeaderProps): ReactNode {
  useDocumentTitle(title);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="serif text-2xl font-bold leading-tight tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
