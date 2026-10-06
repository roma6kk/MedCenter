import type { ReactNode } from 'react';
import Link from 'next/link';
import { NotificationBell } from './notification-bell';
import { LocaleSwitcher } from './locale-switcher';

const PATIENT_LINKS = [
  { href: '/booking', label: 'Запись' },
  { href: '/appointments', label: 'Мои записи' },
  { href: '/history', label: 'История' },
  { href: '/prescriptions', label: 'Назначения' },
  { href: '/notifications', label: 'Уведомления' },
];

export function PatientShell({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">Перейти к содержимому</a>
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <nav aria-label="Пациент" className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          {PATIENT_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
              {link.label}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <LocaleSwitcher />
          </span>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
