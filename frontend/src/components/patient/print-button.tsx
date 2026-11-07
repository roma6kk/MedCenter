'use client';

import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';

export function PrintButton({ label }: { readonly label: string }): ReactNode {
  return (
    <button type="button" onClick={() => window.print()} className={`no-print ${buttonVariants({ variant: 'secondary' })}`}>
      {label}
    </button>
  );
}
