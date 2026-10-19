'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useT } from '@/lib/i18n/use-t';

/**
 * Top row of the sign-in and registration card: the way back to the public site and the language switch. These are the
 * only screens without a shell header, so a visitor who arrived by mistake would otherwise have no way out (WCAG 3.2.3).
 */
export function AuthCardHeader(): ReactNode {
  const t = useT('layout');
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Link href="/" className="serif inline-flex min-h-[44px] items-center text-lg font-bold">{t('brand')}</Link>
      <LocaleSwitcher />
    </div>
  );
}
