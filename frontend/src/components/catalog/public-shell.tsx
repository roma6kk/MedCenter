'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PageTransition } from '@/components/layout/page-transition';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { SECTION_CLASS } from './catalog-styles';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

export function PublicShell({ children }: { readonly children: ReactNode }): ReactNode {
  const isHome: boolean = usePathname() === '/';
  return (
    <div className={`flex min-h-screen flex-col ${isHome ? 'pb-24 md:pb-0' : 'warm-ambient'}`}>
      <SkipLink />
      <PublicHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`flex-1 focus:outline-none ${isHome ? '' : `${SECTION_CLASS} py-10`}`}><PageTransition>{children}</PageTransition></main>
      <PublicFooter />
    </div>
  );
}
