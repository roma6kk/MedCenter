'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useCanBook } from '@/hooks/use-can-book';
import { useT } from '@/lib/i18n/use-t';

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
