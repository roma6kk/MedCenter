import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginEntry } from '@/components/auth/login-entry';
import { parseLoginError } from '@/components/auth/login-error';
import { authorizeHref, isSessionEnded } from '@/lib/auth/authorize-href';
import { sanitizeReturnTo } from '@/lib/auth/return-to';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('auth.login.title');

interface LoginPageProps {
  readonly searchParams?: Promise<{ returnTo?: string | string[]; error?: string | string[]; reason?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const { returnTo, error, reason } = (await searchParams) ?? {};
  const safeReturnTo: string = sanitizeReturnTo(typeof returnTo === 'string' ? returnTo : returnTo?.[0], '');
  const kind = parseLoginError(error);
  if (kind === null && !isSessionEnded(reason)) redirect(authorizeHref(safeReturnTo));
  return <LoginEntry returnTo={safeReturnTo} error={kind} />;
}
