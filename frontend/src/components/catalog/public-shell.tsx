'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Plus } from 'lucide-react';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { NavLink } from '@/components/layout/nav-link';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { buttonVariants } from '@/components/ui/button-variants';
import { ROLE_LANDING } from '@/lib/auth/user-role';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_CONTACTS, HOME_ANCHORS } from './home-content';
import { PublicFooter } from './public-footer';

const LINK_CLASS = 'inline-flex min-h-[44px] items-center rounded-control px-3 text-[15px] font-medium hover:bg-secondary';

/** Sign-in and registration for a visitor; the way back to the cabinet for someone who is signed in. */
function AccountLinks(): ReactNode {
  const t = useT('public');
  const role = useSessionStore((state) => state.role);
  if (role !== null) return <Link href={ROLE_LANDING[role]} className={buttonVariants({ variant: 'secondary' })}>{t('cabinet')}</Link>;
  return (
    <>
      <Link href="/login" className={buttonVariants({ variant: 'ghost' })}>{t('login')}</Link>
      <Link href="/register" className={buttonVariants({ variant: 'secondary' })}>{t('register')}</Link>
    </>
  );
}

/**
 * Frame of the public pages: brand, section navigation, the clinic phone, the way in and the language switch (redesign
 * canvas). The landing page draws its own full-width bands, so its `<main>` carries no width or padding of its own.
 */
export function PublicShell({ children }: { readonly children: ReactNode }): ReactNode {
  const tLayout = useT('layout');
  const t = useT('public');
  const isHome: boolean = usePathname() === '/';
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-border bg-card">
        <nav aria-label={t('navLabel')} className={`${SECTION_CLASS} flex flex-wrap items-center gap-x-4 gap-y-1 py-3`}>
          <Link href="/" className="mr-4 inline-flex min-h-[44px] items-center gap-2.5 text-[19px] font-bold">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-primary-foreground">
              <Plus className="h-5 w-5" strokeWidth={2.4} />
            </span>
            {tLayout('brand')}
          </Link>
          <span className="flex flex-wrap gap-0.5">
            <Link href={`/#${HOME_ANCHORS.directions}`} className={LINK_CLASS}>{t('directions')}</Link>
            <NavLink href="/doctors" className={LINK_CLASS}>{t('doctors')}</NavLink>
            <Link href={`/#${HOME_ANCHORS.companies}`} className={LINK_CLASS}>{t('companies')}</Link>
            <Link href={`/#${HOME_ANCHORS.contacts}`} className={LINK_CLASS}>{t('contacts')}</Link>
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <a href={CLINIC_CONTACTS.phoneHref} className="hidden min-h-[44px] items-center gap-2 px-2 text-[15px] font-semibold hover:underline lg:inline-flex">
              <Phone aria-hidden="true" className="h-[18px] w-[18px] text-primary" />
              {CLINIC_CONTACTS.phone}
            </a>
            <AccountLinks />
            <LocaleSwitcher />
          </span>
        </nav>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`flex-1 focus:outline-none ${isHome ? '' : `${SECTION_CLASS} py-10`}`}>{children}</main>
      <PublicFooter />
    </div>
  );
}
