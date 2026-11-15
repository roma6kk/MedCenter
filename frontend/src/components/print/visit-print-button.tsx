'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/ui/cn';

interface VisitPrintButtonProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly children: (finish: () => void) => ReactNode;
}

export function VisitPrintButton({ label, ariaLabel, className, children }: VisitPrintButtonProps): ReactNode {
  const [printing, setPrinting] = useState(false);
  const finish = useCallback(() => setPrinting(false), []);
  return (
    <>
      <button type="button" aria-label={ariaLabel} onClick={() => setPrinting(true)} className={cn('no-print', buttonVariants({ variant: 'secondary' }), className)}>{label}</button>
      {printing ? children(finish) : null}
    </>
  );
}
