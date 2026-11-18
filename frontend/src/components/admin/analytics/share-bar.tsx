import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export function ShareBar({ percent, className }: { readonly percent: number; readonly className?: string }): ReactNode {
  return (
    <div aria-hidden="true" className={cn('h-2 overflow-hidden rounded-full bg-secondary', className)}>
      <div data-testid="share-bar-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} className="h-full rounded-full bg-primary" />
    </div>
  );
}
