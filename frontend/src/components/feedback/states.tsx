'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

interface StateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function ForbiddenState({ title, description, action }: StateProps): ReactNode {
  const t = useT('feedback');
  return (
    <div data-testid="forbidden-state" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('forbiddenTitle')}</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">{title}</p>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
      {action}
    </div>
  );
}

export function NotFoundState({ title, description, action }: StateProps): ReactNode {
  const t = useT('feedback');
  return (
    <div data-testid="not-found-state" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">{title}</p>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }: StateProps): ReactNode {
  return (
    <div data-testid="empty-state" className="mx-auto max-w-md p-8 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-[var(--muted-foreground)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function TableSkeleton(): ReactNode {
  const t = useT('common');
  return (
    <div data-testid="table-skeleton" role="status" aria-busy="true" className="animate-pulse space-y-2">
      <span className="sr-only">{t('loading')}</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} aria-hidden="true" className="h-11 rounded-control bg-[var(--secondary)]" />
      ))}
    </div>
  );
}
