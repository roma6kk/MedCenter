'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useT } from '@/lib/i18n/use-t';

export function AuthCardHeader(): ReactNode {
  const t = useT('layout');
  return (
    <div className="mb-5 flex items-center justify-between gap-2">
      <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 text-lg font-bold">
        <BrandMark size={40} />
        {t('brand')}
      </Link>
      <LocaleSwitcher />
    </div>
  );
}
