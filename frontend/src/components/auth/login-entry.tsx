'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { authorizeHref } from '@/lib/auth/authorize-href';
import { useT } from '@/lib/i18n/use-t';
import type { LoginErrorKind } from './login-error';

interface LoginEntryProps {
  readonly returnTo: string;
  readonly error?: LoginErrorKind | null;
}

export function LoginEntry({ returnTo, error = null }: LoginEntryProps): ReactNode {
  const t = useT('auth.login');
  // The static `metadata.title` is Russian (the locale lives in the browser): the tab follows the chosen language.
  useDocumentTitle(t('title'));
  return (
    <div>
      <h1 className="text-2xl font-bold leading-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('lead')}</p>
      {error === null ? null : (
        <p role="alert" data-testid="login-error" className="mt-4 flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(error === 'unavailable' ? 'unavailable' : 'denied')}</span>
        </p>
      )}
      <a
        href={authorizeHref(returnTo)}
        className={`${buttonVariants({ size: 'lg' })} mt-6 w-full`}
      >
        {t('submit')}
      </a>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('noAccount')} <Link href="/register" className="inline-flex min-h-[44px] items-center font-semibold text-primary underline">{t('register')}</Link>
      </p>
    </div>
  );
}
