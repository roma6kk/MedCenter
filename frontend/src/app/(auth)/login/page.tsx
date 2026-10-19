import type { Metadata } from 'next';
import { LoginEntry } from '@/components/auth/login-entry';
import { parseLoginError } from '@/components/auth/login-error';
import { sanitizeReturnTo } from '@/lib/auth/return-to';

export const metadata: Metadata = { title: 'Вход — МедЦентр' };

interface LoginPageProps {
  readonly searchParams?: Promise<{ returnTo?: string; error?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const { returnTo, error } = (await searchParams) ?? {};
  return <LoginEntry returnTo={sanitizeReturnTo(returnTo)} error={parseLoginError(error)} />;
}
