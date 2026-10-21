import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('auth.register.title');

export default function RegisterPage(): React.JSX.Element {
  return <RegisterForm />;
}
