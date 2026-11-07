'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useCanBook } from '@/hooks/use-can-book';
import { useT } from '@/lib/i18n/use-t';

export function HomeActions(): ReactNode {
  const t = useT('home');
  const canBook = useCanBook();
  return (
    <div className="flex flex-wrap gap-3">
      {canBook ? <Link href="/booking" className={buttonVariants({ size: 'lg' })}>{t('book')}</Link> : null}
      <Link href="/doctors" className={buttonVariants({ variant: canBook ? 'secondary' : 'primary', size: 'lg' })}>{t('findDoctor')}</Link>
    </div>
  );
}
