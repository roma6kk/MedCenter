import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

/** A code (ICD-10, ATC, catalogue) in the mono face of the redesign; `system` is the code system it belongs to. */
export function CodeTag({ code, system, className }: { readonly code: string; readonly system?: string; readonly className?: string }): ReactNode {
  return (
    <code data-testid="code-chip" title={system} className={cn('mono inline-block rounded-md bg-secondary px-2 py-0.5 text-[13px] font-medium text-foreground', className)}>
      {code}
    </code>
  );
}
