'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { BrandMark } from '@/components/brand/brand-mark';
import { useT } from '@/lib/i18n/use-t';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';
import { NotificationBell } from './notification-bell';
import { PageTransition } from './page-transition';
import { PatientMobileMenu } from './patient-mobile-menu';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';
import { ThemeSwitcher } from './theme-switcher';

/** Three sections (B6): the home, the appointments, the medical record. The notifications are the bell; «Записаться» is the button on the right. */
const PATIENT_LINKS: ReadonlyArray<{ readonly href: string; readonly key: string }> = [
  { href: '/home', key: 'home' },
  { href: '/appointments', key: 'appointments' },
  { href: '/medcard', key: 'medcard' },
];

const LINK_CLASS = 'rounded-control px-3 text-base font-medium text-foreground hover:bg-secondary';
const ACTIVE_LINK_CLASS = 'bg-primary-soft font-semibold text-primary-soft-foreground hover:bg-primary-soft';

/** Cabinet frame of the redesign: logo mark, pill navigation (the current section on `primary-soft`), bell, language, sign-out. */
export function PatientShell({ children }: { readonly children: ReactNode }): ReactNode {
  const t = useT('layout.patient');
  const tLayout = useT('layout');
  return (
    <div className="warm-ambient min-h-screen">
      <SkipLink />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] items-center gap-x-3 px-4 py-2 md:flex-wrap md:gap-x-7 md:gap-y-3 md:px-6 md:py-3">
          <PatientMobileMenu
            links={PATIENT_LINKS.map((link) => ({ href: link.href, label: t(link.key) }))}
            linkClassName={LINK_CLASS}
            activeLinkClassName={ACTIVE_LINK_CLASS}
          />
          <Link href="/" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2.5 font-bold text-foreground">
            <BrandMark size={36} />
            <span className="text-lg max-[479px]:sr-only">{tLayout('brand')}</span>
          </Link>
          <nav aria-label={t('navLabel')} className="hidden gap-0.5 md:flex">
            {PATIENT_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} className={LINK_CLASS} activeClassName={ACTIVE_LINK_CLASS}>
                {t(link.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center justify-end gap-2 md:flex-wrap md:gap-2.5">
            {/* The one primary action of the cabinet, always within reach; it is not a section, so it sits outside the navigation. */}
            <NavLink href="/booking" className={buttonVariants({ variant: 'primary' })} activeClassName="bg-primary-strong">
              <CalendarPlus aria-hidden="true" size={18} strokeWidth={2.2} />
              {t('book')}
            </NavLink>
            <NotificationBell />
            {/* Language, theme and sign-out sit in the drawer of the burger on a phone. */}
            <div className="hidden items-center gap-2.5 md:flex">
              <LocaleSwitcher />
              <ThemeSwitcher compact />
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 focus:outline-none sm:px-6 md:pt-9"><PageTransition>{children}</PageTransition></main>
    </div>
  );
}
