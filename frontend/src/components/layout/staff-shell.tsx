'use client';

import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  BarChart3,
  BookText,
  CalendarClock,
  CalendarDays,
  DoorOpen,
  ListChecks,
  Menu,
  ScrollText,
  Stethoscope,
  Users,
} from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { DoctorPatientSearch } from '@/components/doctor/doctor-patient-search';
import { Dialog } from '@/components/ui/dialog';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';
import { StaffBrand, StaffNav, type StaffLink } from './staff-nav';
import { PageTransition } from './page-transition';
import { StaffProfileMenu } from './staff-profile-menu';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';

export type { StaffLink };

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

interface PartsProps {
  readonly links: ReadonlyArray<StaffLink>;
  readonly prefix: 'doctor' | 'admin';
}

/**
 * From 1024 px: the sidebar. Its grid cell carries the material (a translucent surface under a backdrop blur) and stretches
 * to the full height of the page, while the panel inside sticks to the viewport: the background no longer ends where the
 * first screen does on a long page.
 */
function StaffSidebar({ links, prefix }: PartsProps): ReactNode {
  return (
    <div className="border-r border-border bg-glass backdrop-blur-md">
      <aside className="sticky top-0 flex h-screen flex-col gap-5 overflow-y-auto px-4 py-5">
        <StaffBrand prefix={prefix} />
        {prefix === 'doctor' ? <DoctorPatientSearch /> : null}
        <StaffNav links={links} prefix={prefix} />
        <div id={STAFF_ASIDE_SLOT_ID} className="empty:hidden" />
        <div className="mt-auto border-t border-border pt-3">
          <StaffProfileMenu variant="full" />
        </div>
      </aside>
    </div>
  );
}

/** A click on a link inside the drawer is a navigation: the drawer has done its job. */
function closeOnLink(event: MouseEvent<HTMLElement>, close: () => void): void {
  if ((event.target as HTMLElement).closest('a') !== null) close();
}

/**
 * Below 1024 px (D7): a top bar with a burger, the brand and the profile button instead of a block of links stacked above
 * the content. The burger opens the navigation in the same drawer the rest of the app uses.
 */
function StaffTopBar({ links, prefix }: PartsProps): ReactNode {
  const t = useT('layout');
  const [isOpen, setIsOpen] = useState(false);
  // The drawer is a sibling of the bar, not its child: `backdrop-filter` makes the bar the containing block of fixed descendants.
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-glass px-3 py-2 backdrop-blur-md">
        <button
          type="button"
          aria-label={t('menu.open')}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-foreground transition-[background-color] duration-fast ease-out hover:bg-secondary"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <p className="flex items-center gap-2 font-bold">
          <BrandMark size={32} />
          <span className="text-lg">{t('brand')}</span>
        </p>
        <div className="ml-auto">
          <StaffProfileMenu variant="avatar" />
        </div>
      </header>
      {isOpen ? (
        <Dialog
          variant="drawer-left"
          title={t('brand')}
          description={t(`${prefix}.caption`)}
          onClose={() => setIsOpen(false)}
        >
          <div
            className="flex flex-col gap-4"
            onClick={(event) => closeOnLink(event, () => setIsOpen(false))}
          >
            {prefix === 'doctor' ? <DoctorPatientSearch /> : null}
            <StaffNav links={links} prefix={prefix} />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** Doctors and administrators have no notification endpoints, so this shell carries no bell. */
export function StaffShell({ children, links }: StaffShellProps): ReactNode {
  const role = useSessionStore((state) => state.role);
  const isDesktop: boolean = useMediaQuery(DESKTOP_QUERY);
  const prefix: 'doctor' | 'admin' = role === 'DOCTOR' ? 'doctor' : 'admin';
  return (
    <div
      className={
        isDesktop
          ? 'staff-ambient grid min-h-screen grid-cols-[248px_minmax(0,1fr)]'
          : 'staff-ambient min-h-screen'
      }
    >
      <SkipLink />
      {isDesktop ? (
        <StaffSidebar links={links} prefix={prefix} />
      ) : (
        <StaffTopBar links={links} prefix={prefix} />
      )}
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="min-w-0 p-4 focus:outline-none sm:p-6 lg:px-8 lg:py-8"
      >
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
