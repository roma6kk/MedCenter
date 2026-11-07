import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export function CodeTag({ code, system, className }: { readonly code: string; readonly system?: string; readonly className?: string }): ReactNode {
  return (
    <code data-testid="code-chip" title={system} className={cn('mono inline-block rounded-sm bg-secondary px-2 py-0.5 text-xs font-medium text-foreground', className)}>
      {code}
    </code>
  );
}
