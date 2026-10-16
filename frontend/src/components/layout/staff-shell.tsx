'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';

export interface StaffLink {
  readonly href: string;
  /** Key under `layout.doctor` / `layout.admin` in the messages catalogue. */
  readonly labelKey: string;
}

interface StaffShellProps {
  readonly children: ReactNode;
  readonly links: ReadonlyArray<StaffLink>;
  /** Accepted for the existing pages; the navigation landmark is named after the signed-in role instead. */
  readonly title?: string;
}

export const DOCTOR_LINKS: ReadonlyArray<StaffLink> = [
  { href: '/doctor/appointments', labelKey: 'doctor.appointments' },
  { href: '/doctor/schedule', labelKey: 'doctor.schedule' },
];

export const ADMIN_LINKS: ReadonlyArray<StaffLink> = [
  { href: '/admin/analytics', labelKey: 'admin.analytics' },
  { href: '/admin/users', labelKey: 'admin.users' },
  { href: '/admin/services', labelKey: 'admin.services' },
  { href: '/admin/rooms', labelKey: 'admin.rooms' },
  { href: '/admin/schedules', labelKey: 'admin.schedules' },
  { href: '/admin/terminology', labelKey: 'admin.terminology' },
  { href: '/admin/audit', labelKey: 'admin.audit' },
];

/** Doctors and administrators have no notification endpoints, so this shell carries no bell. */
export function StaffShell({ children, links }: StaffShellProps): ReactNode {
  const t = useT('layout');
  const role = useSessionStore((state) => state.role);
  const navLabel: string = role === 'DOCTOR' ? t('doctor.navLabel') : t('admin.navLabel');
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
      <aside className="border-b border-[var(--border)] bg-[var(--card)] p-4 lg:border-b-0 lg:border-r">
        <p className="serif text-lg font-bold">{t('brand')}</p>
        <nav aria-label={navLabel} className="mt-4 flex gap-3 overflow-x-auto lg:flex-col">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href} className="rounded-[6px] px-2 py-1 text-sm hover:bg-[var(--secondary)]">
              {t(link.labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <LocaleSwitcher />
          <LogoutButton />
        </header>
        <main id="main-content" tabIndex={-1} className="focus:outline-none p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
