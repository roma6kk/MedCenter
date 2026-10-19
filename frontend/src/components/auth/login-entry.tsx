'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useDocumentTitle } from '@/components/patient/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import type { LoginErrorKind } from './login-error';

interface LoginEntryProps {
  /** Same-origin path to return to after the sign-in (already sanitised by the page). */
  readonly returnTo: string;
  /** The callback sent the visitor back with an OAuth error (`?error=…`), reduced to a kind. */
  readonly error?: LoginErrorKind | null;
}

/**
 * Branded entry of the SMART/OAuth2 flow (frontend-design-spec §2, UI-1): the credentials form belongs to
 * auth-service, so this screen only starts the flow at `/api/auth/authorize` and points new patients to `/register`.
 */
export function LoginEntry({ returnTo, error = null }: LoginEntryProps): ReactNode {
  const t = useT('auth.login');
  const tLayout = useT('layout');
  // The static `metadata.title` is Russian (the locale lives in the browser): the tab follows the chosen language.
  useDocumentTitle(t('title'), tLayout('brand'));
  return (
    <div>
      <h1 className="serif text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('lead')}</p>
      {error === null ? null : (
        <p role="alert" data-testid="login-error" className="mt-4 rounded-[6px] border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">
          {t(error === 'unavailable' ? 'unavailable' : 'denied')}
        </p>
      )}
      <a
        href={`/api/auth/authorize?returnTo=${encodeURIComponent(returnTo)}`}
        className="mt-6 block min-h-[44px] rounded-[6px] bg-[var(--primary)] px-4 py-2.5 text-center text-[var(--primary-foreground)]"
      >
        {t('submit')}
      </a>
      <p className="mt-4 text-sm">
        {t('noAccount')} <Link href="/register" className="underline">{t('register')}</Link>
      </p>
    </div>
  );
}
