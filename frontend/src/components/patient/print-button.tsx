'use client';

import type { ReactNode } from 'react';

/** Prints the page (the print stylesheet drops the navigation and keeps the cards): a history or prescription extract. */
export function PrintButton({ label }: { readonly label: string }): ReactNode {
  return (
    <button type="button" onClick={() => window.print()} className="no-print min-h-[44px] rounded-[6px] border border-[var(--border)] px-4 text-sm hover:bg-[var(--secondary)]">
      {label}
    </button>
  );
}
