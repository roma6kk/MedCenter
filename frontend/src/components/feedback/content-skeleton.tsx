'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { LoadingNote } from './loading-note';
import { useLeadSkeleton } from './use-lead-skeleton';

type ContentSkeletonShape = 'list' | 'tiles' | 'timeline' | 'cards' | 'detail';

interface ContentSkeletonProps {
  readonly shape: ContentSkeletonShape;
  readonly rows?: number;
  readonly className?: string;
}

const ROW_CLASS = 'flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4';

function ListRows({ rows }: { readonly rows: number }): ReactNode {
  return (
    <div data-testid="content-skeleton-list" className="divide-y divide-border overflow-hidden rounded-card border border-border-soft bg-card shadow-elev-1">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} data-skeleton-row="" className={ROW_CLASS}>
          <Skeleton className="h-6 w-14" />
          <div className="flex min-w-0 flex-[999_1_200px] flex-col gap-2">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function TileRows({ rows }: { readonly rows: number }): ReactNode {
  return (
    <div data-testid="content-skeleton-tiles" className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-card">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} data-skeleton-row="" className={ROW_CLASS}>
          <Skeleton className="size-11 rounded-control" />
          <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-2">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <Skeleton className="size-11 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function Timeline({ rows }: { readonly rows: number }): ReactNode {
  return (
    <div data-testid="content-skeleton-timeline" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} data-skeleton-row="" className="flex items-center gap-3.5 rounded-card border border-border bg-card px-5 py-4">
          <Skeleton className="size-16 flex-none rounded-card" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Cards({ rows }: { readonly rows: number }): ReactNode {
  return (
    <div data-testid="content-skeleton-cards" className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} data-skeleton-row="" className="flex flex-col gap-3 rounded-card border border-border-soft bg-card p-5 shadow-elev-1">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-14 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function Detail(): ReactNode {
  return (
    <div data-testid="content-skeleton-detail" className="flex flex-col gap-5 rounded-card border border-border-soft bg-card p-5 shadow-elev-1">
      <div className="flex items-center gap-4">
        <Skeleton shape="circle" className="size-14 flex-none" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-14 rounded-control" />
        <Skeleton className="h-14 rounded-control" />
        <Skeleton className="h-14 rounded-control" />
        <Skeleton className="h-14 rounded-control" />
      </div>
    </div>
  );
}

export function ContentSkeleton({ shape, rows = 3, className }: ContentSkeletonProps): ReactNode {
  const t = useT('common');
  const { ref, isLead } = useLeadSkeleton<HTMLDivElement>();
  return (
    <div ref={ref} role={isLead ? 'status' : undefined} aria-busy={isLead ? 'true' : undefined} className={cn('flex flex-col', className)}>
      {isLead ? <span className="sr-only">{t('loading')}</span> : null}
      <div aria-hidden="true">
        {shape === 'list' ? <ListRows rows={rows} /> : null}
        {shape === 'tiles' ? <TileRows rows={rows} /> : null}
        {shape === 'timeline' ? <Timeline rows={rows} /> : null}
        {shape === 'cards' ? <Cards rows={rows} /> : null}
        {shape === 'detail' ? <Detail /> : null}
      </div>
      <LoadingNote quiet={!isLead} />
    </div>
  );
}
