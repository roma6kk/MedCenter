import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & { readonly shape?: 'line' | 'block' | 'circle' };

const SHAPE_CLASS: Readonly<Record<NonNullable<SkeletonProps['shape']>, string>> = {
  line: 'h-4 rounded-sm',
  block: 'h-24 rounded-card',
  circle: 'size-12 rounded-full',
};

/**
 * One placeholder shape with the shimmer of `.skeleton` (globals.css). Size it with the caller's classes so the placeholder
 * has the form of the content it stands for. It is decoration: the loading region around it carries the status text.
 */
export function Skeleton({ shape = 'line', className, ...rest }: SkeletonProps): ReactNode {
  return <div aria-hidden="true" className={cn('skeleton', SHAPE_CLASS[shape], className)} {...rest} />;
}

/** A paragraph of `lines` lines; the last one is shorter, like the end of real text. */
export function SkeletonText({ lines = 3, className }: { readonly lines?: number; readonly className?: string }): ReactNode {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton key={line} className={line === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}
