'use client';

import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';

/** Prints the page (the print stylesheet drops the navigation and keeps the cards): a history or prescription extract. */
export function PrintButton({ label }: { readonly label: string }): ReactNode {
  return (
    <button type="button" onClick={() => window.print()} className={`no-print ${buttonVariants({ variant: 'secondary' })}`}>
      {label}
    </button>
  );
}
