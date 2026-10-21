'use client';

import type { ReactNode } from 'react';
import {
  BarChart3,
  BookText,
  CalendarClock,
  CalendarDays,
  DoorOpen,
  ListChecks,
  ScrollText,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useSessionStore } from '@/store/use-session-store';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';

export interface StaffLink {
  readonly href: string;
  /** Key under `layout.doctor` / `layout.admin` in the messages catalogue. */
  readonly labelKey: string;
  readonly icon?: LucideIcon;
}

interface StaffShellProps {
  readonly children: ReactNode;
  readonly links: ReadonlyArray<StaffLink>;
  /** Accepted for the existing pages; the navigation landmark is named after the signed-in role instead. */
  readonly title?: string;
}

/** Empty box under the navigation that a page may fill (through a portal) with something that belongs to the sidebar, e.g. a legend. */
export const STAFF_ASIDE_SLOT_ID = 'staff-aside-slot';

export const DOCTOR_LINKS: ReadonlyArray<StaffLink> = [
  { href: '/doctor/appointments', labelKey: 'doctor.appointments', icon: ListChecks },
  { href: '/doctor/schedule', labelKey: 'doctor.schedule', icon: CalendarDays },
];

export const ADMIN_LINKS: ReadonlyArray<StaffLink> = [
  { href: '/admin/analytics', labelKey: 'admin.analytics', icon: BarChart3 },
  { href: '/admin/users', labelKey: 'admin.users', icon: Users },
  { href: '/admin/services', labelKey: 'admin.services', icon: Stethoscope },
  { href: '/admin/rooms', labelKey: 'admin.rooms', icon: DoorOpen },
  { href: '/admin/schedules', labelKey: 'admin.schedules', icon: CalendarClock },
  { href: '/admin/terminology', labelKey: 'admin.terminology', icon: BookText },
  { href: '/admin/audit', labelKey: 'admin.audit', icon: ScrollText },
];

/** The pill of a navigation item; the current one sits on `primary-soft` (the global underline of `NavLink` is switched off for it). */
const NAV_PILL = cn(
  'gap-3 rounded-control px-3 text-[15px] font-medium text-foreground transition-colors hover:bg-secondary',
  'aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary-soft-foreground aria-[current=page]:no-underline',
);

function LogoMark(): ReactNode {
  return (
    <span aria-hidden="true" className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 6v12M6 12h12" />
      </svg>
    </span>
  );
}

/** Doctors and administrators have no notification endpoints, so this shell carries no bell. */
export function StaffShell({ children, links }: StaffShellProps): ReactNode {
  const t = useT('layout');
  const role = useSessionStore((state) => state.role);
  const prefix: 'doctor' | 'admin' = role === 'DOCTOR' ? 'doctor' : 'admin';
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <SkipLink />
      <aside className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-5">
        <p className="flex items-center gap-2.5 px-2">
          <LogoMark />
          <span className="flex flex-col leading-tight">
            <span className="text-[17px] font-bold">{t('brand')}</span>
            <span className="text-xs text-muted-foreground">{t(`${prefix}.caption`)}</span>
          </span>
        </p>
        <nav aria-label={t(`${prefix}.navLabel`)} className="flex flex-wrap gap-x-2 gap-y-1 lg:flex-col lg:gap-1">
          {links.map((link) => {
            const Icon: LucideIcon | undefined = link.icon;
            return (
              <NavLink key={link.href} href={link.href} className={NAV_PILL}>
                {Icon ? <Icon aria-hidden="true" className="size-[18px] shrink-0" /> : null}
                {t(link.labelKey)}
              </NavLink>
            );
          })}
        </nav>
        <div id={STAFF_ASIDE_SLOT_ID} className="empty:hidden" />
        <div className="flex flex-col gap-3 border-t border-border px-2 pt-3 lg:mt-auto">
          <p className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
              <UserRound className="size-[18px]" />
            </span>
            <span className="text-sm font-semibold">{t(`${prefix}.user`)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleSwitcher />
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 p-4 focus:outline-none sm:p-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
