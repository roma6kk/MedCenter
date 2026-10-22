import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

/** The square plus logo of the clinic: the same mark the other headers wear. Decorative, the word next to it names it. */
export function BrandMark(): ReactNode {
  return (
    <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-primary text-primary-foreground">
      <Plus className="h-5 w-5" strokeWidth={2.4} />
    </span>
  );
}
