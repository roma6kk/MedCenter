import type { ReactNode } from 'react';
import Link from 'next/link';
import { NotificationBell } from './notification-bell';
import { LocaleSwitcher } from './locale-switcher';

interface StaffShellProps {
  readonly children: ReactNode;
  readonly links: ReadonlyArray<{ href: string; label: string }>;
  readonly title: string;
}

export function StaffShell({ children, links, title }: StaffShellProps): ReactNode {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <a href="#main" className="skip-link">Перейти к содержимому</a>
      <aside className="border-b border-[var(--border)] bg-[var(--card)] p-4 lg:border-b-0 lg:border-r">
        <p className="serif text-lg font-bold">МедЦентр</p>
        <nav aria-label={title} className="mt-4 flex gap-3 overflow-x-auto lg:flex-col">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-[6px] px-2 py-1 text-sm hover:bg-[var(--secondary)]">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <NotificationBell />
          <LocaleSwitcher />
        </header>
        <main id="main" className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export const DOCTOR_LINKS = [
  { href: '/doctor/appointments', label: 'Журнал' },
  { href: '/doctor/schedule', label: 'Расписание' },
];

export const ADMIN_LINKS = [
  { href: '/admin/analytics', label: 'Аналитика' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/services', label: 'Услуги' },
  { href: '/admin/rooms', label: 'Кабинеты' },
  { href: '/admin/schedules', label: 'Расписания' },
  { href: '/admin/terminology', label: 'Терминология' },
  { href: '/admin/audit', label: 'Аудит' },
];
