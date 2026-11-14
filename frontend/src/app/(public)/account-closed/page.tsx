import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountClosed } from '@/components/account/account-closed';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('accountClosure.closedTitle');

export default function AccountClosedPage(): ReactNode {
  return <AccountClosed />;
}
