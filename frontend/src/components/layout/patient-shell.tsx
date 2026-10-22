'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';
import { useT } from '@/lib/i18n/use-t';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';
import { NotificationBell } from './notification-bell';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';

const PATIENT_LINKS: ReadonlyArray<{ readonly href: string; readonly key: string }> = [
  { href: '/booking', key: 'booking' },
  { href: '/appointments', key: 'appointments' },
  { href: '/history', key: 'history' },
  { href: '/prescriptions', key: 'prescriptions' },
  { href: '/profile', key: 'profile' },
];

const LINK_CLASS = 'rounded-control px-3 text-[15px] font-medium text-foreground hover:bg-secondary';
const ACTIVE_LINK_CLASS = 'bg-primary-soft font-semibold text-primary-soft-foreground hover:bg-primary-soft';

/** Cabinet frame of the redesign: logo mark, pill navigation (the current section on `primary-soft`), bell, language, sign-out. */
export function PatientShell({ children }: { readonly children: ReactNode }): ReactNode {
  const t = useT('layout.patient');
  const tLayout = useT('layout');
  return (
    <div className="min-h-screen">
      <SkipLink />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3">
          <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 font-bold text-foreground">
            <BrandMark size={36} />
            <span className="text-lg">{tLayout('brand')}</span>
          </Link>
          <nav aria-label={t('navLabel')} className="flex flex-wrap gap-0.5">
            {PATIENT_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} className={LINK_CLASS} activeClassName={ACTIVE_LINK_CLASS}>
                {t(link.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <NotificationBell />
            <LocaleSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-[1200px] px-6 pb-16 pt-9 focus:outline-none">{children}</main>
    </div>
  );
}
