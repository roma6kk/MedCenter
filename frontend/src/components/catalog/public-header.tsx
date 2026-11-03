'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, Phone } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { NavLink } from '@/components/layout/nav-link';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';
import { buttonVariants } from '@/components/ui/button-variants';
import { Dialog } from '@/components/ui/dialog';
import { useCanBook } from '@/hooks/use-can-book';
import { AUTHORIZE_PATH } from '@/lib/auth/authorize-href';
import { ROLE_LANDING } from '@/lib/auth/user-role';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_CONTACTS, HOME_ANCHORS } from './home-content';

const LINK_CLASS = 'inline-flex min-h-[44px] items-center rounded-control px-3 text-base font-medium hover:bg-secondary';
const DRAWER_LINK_CLASS = 'flex min-h-[48px] items-center border-b border-border-soft text-lg font-medium';

/** Sign-in is a plain `<a>`: the target is a route handler that answers a redirect to another origin, which `next/link` must not prefetch. */
function SignInLink({ className }: { readonly className: string }): ReactNode {
  const t = useT('public');
  return <a href={AUTHORIZE_PATH} className={className}>{t('login')}</a>;
}

/** The booking button of the header; doctors and administrators do not book, so they never see it. */
function BookLink({ className, onNavigate }: { readonly className: string; readonly onNavigate?: () => void }): ReactNode {
  const t = useT('public');
  const canBook = useCanBook();
  if (!canBook) return null;
  return <Link href="/booking" onClick={onNavigate} className={className}>{t('book')}</Link>;
}

/** Sign-in and registration for a visitor; the way back to the cabinet for someone who is signed in. */
function AccountLinks(): ReactNode {
  const t = useT('public');
  const role = useSessionStore((state) => state.role);
  if (role !== null) return <Link href={ROLE_LANDING[role]} className={buttonVariants({ variant: 'secondary' })}>{t('cabinet')}</Link>;
  return (
    <>
      <SignInLink className={buttonVariants({ variant: 'ghost' })} />
      <Link href="/register" className={buttonVariants({ variant: 'secondary' })}>{t('register')}</Link>
    </>
  );
}

function PhoneLink({ className }: { readonly className: string }): ReactNode {
  return (
    <a href={CLINIC_CONTACTS.phoneHref} className={className}>
      <Phone aria-hidden="true" className="h-[18px] w-[18px] flex-none text-primary" />
      <span className="sr-only 2xl:not-sr-only">{CLINIC_CONTACTS.phone}</span>
    </a>
  );
}

/** The drawer behind the burger: everything the header row has no room for on a phone or a small laptop. */
function MobileMenu({ onClose }: { readonly onClose: () => void }): ReactNode {
  const t = useT('public');
  const role = useSessionStore((state) => state.role);
  return (
    <Dialog title={t('menuTitle')} variant="drawer" onClose={onClose}>
      <nav aria-label={t('navLabel')} className="flex flex-col">
        <Link href={`/#${HOME_ANCHORS.directions}`} onClick={onClose} className={DRAWER_LINK_CLASS}>{t('directions')}</Link>
        <Link href="/doctors" onClick={onClose} className={DRAWER_LINK_CLASS}>{t('doctors')}</Link>
        <Link href={`/#${HOME_ANCHORS.companies}`} onClick={onClose} className={DRAWER_LINK_CLASS}>{t('companies')}</Link>
        <Link href={`/#${HOME_ANCHORS.contacts}`} onClick={onClose} className={DRAWER_LINK_CLASS}>{t('contacts')}</Link>
      </nav>
      <div className="mt-5 flex flex-col gap-3">
        {role === null ? (
          <>
            <SignInLink className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} w-full`} />
            <Link href="/register" onClick={onClose} className={`${buttonVariants({ variant: 'ghost', size: 'lg' })} w-full`}>{t('register')}</Link>
          </>
        ) : (
          <Link href={ROLE_LANDING[role]} onClick={onClose} className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} w-full`}>{t('cabinet')}</Link>
        )}
      </div>
      <a href={CLINIC_CONTACTS.phoneHref} className="mt-5 flex min-h-[48px] items-center gap-3 text-lg font-semibold">
        <Phone aria-hidden="true" className="h-5 w-5 text-primary" />
        {CLINIC_CONTACTS.phone}
      </a>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-soft pt-4">
        <LocaleSwitcher />
        <ThemeSwitcher compact />
      </div>
    </Dialog>
  );
}

/**
 * Header of the public pages (C9). From `xl`: brand, section links, phone, «Записаться», sign-in and the switches in one row.
 * Below it, one row of the brand, the phone icon, «Записаться» and a burger (the rest in a drawer), so a phone's header is a
 * single 64 px row instead of three wrapped ones, and the booking and the registry phone are always in reach.
 */
export function PublicHeader(): ReactNode {
  const tLayout = useT('layout');
  const t = useT('public');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  return (
    <header className="border-b border-border bg-card">
      <nav aria-label={t('navLabel')} className={`${SECTION_CLASS} flex items-center gap-x-3 py-2 max-sm:px-4`}>
        <Link href="/" className="mr-2 inline-flex min-h-[44px] items-center gap-2.5 text-lg font-bold">
          <BrandMark size={40} />
          <span className="max-[379px]:sr-only">{tLayout('brand')}</span>
        </Link>
        <span className="hidden gap-0.5 xl:flex">
          <Link href={`/#${HOME_ANCHORS.directions}`} className={LINK_CLASS}>{t('directions')}</Link>
          <NavLink href="/doctors" className={LINK_CLASS}>{t('doctors')}</NavLink>
          <Link href={`/#${HOME_ANCHORS.companies}`} className={LINK_CLASS}>{t('companies')}</Link>
          <Link href={`/#${HOME_ANCHORS.contacts}`} className={LINK_CLASS}>{t('contacts')}</Link>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <PhoneLink className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-control px-2 text-sm font-semibold hover:bg-secondary" />
          <BookLink className={buttonVariants({ variant: 'primary' })} />
          <span className="hidden items-center gap-2 xl:flex">
            <AccountLinks />
            <LocaleSwitcher />
            <ThemeSwitcher compact />
          </span>
          <button
            type="button"
            aria-label={t('menuOpen')}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-control hover:bg-secondary xl:hidden"
          >
            <Menu aria-hidden="true" className="size-6" />
          </button>
        </span>
      </nav>
      {menuOpen ? <MobileMenu onClose={() => setMenuOpen(false)} /> : null}
    </header>
  );
}
