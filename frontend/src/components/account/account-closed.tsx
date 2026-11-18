'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { ClosureNotice } from './closure-notice';

export function AccountClosed(): ReactNode {
  const t = useT('accountClosure');
  useDocumentTitle(t('closedTitle'));
  return (
    <article className="flex max-w-xl flex-col gap-4" aria-labelledby="account-closed-title">
      <h1 id="account-closed-title" className="text-3xl font-bold tracking-tight">{t('closedTitle')}</h1>
      <p role="status" className="text-base">{t('closedLead')}</p>
      <ClosureNotice headingLevel="h2" showRemoved={false} />
      <Link href="/" className={`${buttonVariants()} self-start`}>{t('closedHome')}</Link>
    </article>
  );
}
