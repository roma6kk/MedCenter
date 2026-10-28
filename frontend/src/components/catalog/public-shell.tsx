'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { SECTION_CLASS } from './catalog-styles';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

/**
 * Frame of the public pages: the header (brand, section navigation, the clinic phone, booking, the way in and the switches),
 * the page and the footer (redesign canvas). The landing page draws its own full-width bands, so its `<main>` carries no
 * width or padding of its own; it also leaves room under the page (`pb-24`, phone only) for its sticky booking bar.
 */
export function PublicShell({ children }: { readonly children: ReactNode }): ReactNode {
  const isHome: boolean = usePathname() === '/';
  return (
    <div className={`flex min-h-screen flex-col ${isHome ? 'pb-24 md:pb-0' : 'warm-ambient'}`}>
      <SkipLink />
      <PublicHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`flex-1 focus:outline-none ${isHome ? '' : `${SECTION_CLASS} py-10`}`}>{children}</main>
      <PublicFooter />
    </div>
  );
}
