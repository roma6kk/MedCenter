'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { NavLink } from '@/components/layout/nav-link';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { ROLE_LANDING } from '@/lib/auth/user-role';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';

const LINK_CLASS = 'inline-flex min-h-[44px] items-center rounded-[6px] px-2 text-sm font-medium hover:underline';

/** Sign-in and registration for a visitor; the way back to the cabinet for someone who is signed in. */
function AccountLinks(): ReactNode {
  const t = useT('public');
  const role = useSessionStore((state) => state.role);
  if (role !== null) return <Link href={ROLE_LANDING[role]} className={LINK_CLASS}>{t('cabinet')}</Link>;
  return (
    <>
      <Link href="/login" className={LINK_CLASS}>{t('login')}</Link>
      <Link href="/register" className="inline-flex min-h-[44px] items-center rounded-[6px] border border-[var(--border)] px-3 text-sm hover:bg-[var(--secondary)]">
        {t('register')}
      </Link>
    </>
  );
}

/** Frame of the public catalog pages: brand, navigation, language switch and the way in (frontend-design-spec §3). */
export function PublicShell({ children }: { readonly children: ReactNode }): ReactNode {
  const tLayout = useT('layout');
  const t = useT('public');
  return (
    <div className="min-h-screen">
      <SkipLink />
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <nav aria-label={t('navLabel')} className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2">
          <Link href="/" className="serif mr-2 inline-flex min-h-[44px] items-center text-lg font-bold">{tLayout('brand')}</Link>
          <NavLink href="/doctors" className={LINK_CLASS}>{t('doctors')}</NavLink>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <AccountLinks />
            <LocaleSwitcher />
          </span>
        </nav>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 focus:outline-none">{children}</main>
    </div>
  );
}
