import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginEntry } from '@/components/auth/login-entry';
import { parseLoginError } from '@/components/auth/login-error';
import { authorizeHref, isSessionEnded } from '@/lib/auth/authorize-href';
import { sanitizeReturnTo } from '@/lib/auth/return-to';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('auth.login.title');

interface LoginPageProps {
  readonly searchParams?: Promise<{ returnTo?: string; error?: string | string[]; reason?: string | string[] }>;
}

/**
 * `/login` is a hop, not a screen (C2): the credentials form belongs to auth-service, so a visitor goes straight to the
 * authorization redirect (the middleware and old links still arrive here with `returnTo`). Only a callback that sent the
 * visitor back with an OAuth `?error=` shows a page, with the message and a retry (redirecting again would loop), and so does
 * a revoked session (`?reason=session-ended`): the toast on this page says why the visitor must sign in again, and a
 * redirect would carry them off before they could read it.
 */
export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const { returnTo, error, reason } = (await searchParams) ?? {};
  const safeReturnTo: string = sanitizeReturnTo(returnTo, '');
  const kind = parseLoginError(error);
  if (kind === null && !isSessionEnded(reason)) redirect(authorizeHref(safeReturnTo));
  return <LoginEntry returnTo={safeReturnTo} error={kind} />;
}
