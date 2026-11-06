'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingNote } from './loading-note';
import { useLeadSkeleton } from './use-lead-skeleton';
import { useT } from '@/lib/i18n/use-t';

interface StateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

interface EmptyStateProps extends StateProps {
  readonly icon?: LucideIcon;
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

export function EmptyState({ title, description, action, icon: Icon }: EmptyStateProps): ReactNode {
  return (
    <div data-testid="empty-state" className="mx-auto flex max-w-md flex-col items-center p-8 text-center">
      {Icon === undefined ? null : (
        <span aria-hidden="true" data-testid="empty-state-icon" className="mb-5 inline-flex size-24 items-center justify-center rounded-full bg-secondary">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
            <Icon className="size-8" strokeWidth={1.75} />
          </span>
        </span>
      )}
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-[var(--muted-foreground)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function TableSkeleton(): ReactNode {
  const t = useT('common');
  const { ref, isLead } = useLeadSkeleton<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="table-skeleton" role={isLead ? 'status' : undefined} aria-busy={isLead ? 'true' : undefined} className="space-y-2">
      {isLead ? <span className="sr-only">{t('loading')}</span> : null}
      {[0, 1, 2, 3].map((row) => (
        <div key={row} aria-hidden="true" className="flex h-14 items-center gap-4 rounded-control border border-border-soft px-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
        </div>
      ))}
      <LoadingNote quiet={!isLead} />
    </div>
  );
}
