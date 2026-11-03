'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useCanBook } from '@/hooks/use-can-book';
import { useT } from '@/lib/i18n/use-t';

/**
 * The landing's sticky bottom bar on a phone (C9): «Записаться на приём» stays under the thumb however far the visitor has
 * scrolled. From `md` the header carries the same button, so the bar goes. Doctors and administrators do not book. The shell
 * leaves room under the page (`pb-24`) so the bar never covers the footer.
 */
export function MobileBookBar(): ReactNode {
  const t = useT('home');
  const canBook = useCanBook();
  if (!canBook) return null;
  return (
    <div data-testid="mobile-book-bar" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-glass px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden">
      <Link href="/booking" className={`${buttonVariants({ size: 'lg' })} w-full`}>{t('book')}</Link>
    </div>
  );
}
