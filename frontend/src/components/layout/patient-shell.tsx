'use client';

import type { ReactNode } from 'react';
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

export function PatientShell({ children }: { readonly children: ReactNode }): ReactNode {
  const t = useT('layout.patient');
  return (
    <div className="min-h-screen">
      <SkipLink />
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <nav aria-label={t('navLabel')} className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          {PATIENT_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} className="text-sm font-medium hover:underline">
              {t(link.key)}
            </NavLink>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <LocaleSwitcher />
            <LogoutButton />
          </span>
        </nav>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="focus:outline-none mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
