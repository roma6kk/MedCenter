'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useT } from '@/lib/i18n/use-t';

/**
 * Top row above the sign-in and registration card: the brand (the way back to the public site) and the language switch.
 * These are the only screens without a shell header, so a visitor who arrived by mistake would otherwise have no way out (WCAG 3.2.3).
 */
export function AuthCardHeader(): ReactNode {
  const t = useT('layout');
  return (
    <div className="mb-5 flex items-center justify-between gap-2">
      <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 text-[19px] font-bold">
        <BrandMark size={40} />
        {t('brand')}
      </Link>
      <LocaleSwitcher />
    </div>
  );
}
