'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';

interface ClosureNoticeProps {
  readonly headingLevel: 'h2' | 'h3';
  // Before the deletion the notice also lists what goes; afterwards only what stays and why.
  readonly showRemoved: boolean;
}

export function ClosureNotice({ headingLevel: Heading, showRemoved }: ClosureNoticeProps): ReactNode {
  const t = useT('accountClosure');
  return (
    <div className="flex flex-col gap-3 text-sm leading-normal">
      {showRemoved ? (
        <section>
          <Heading className="font-semibold">{t('removedTitle')}</Heading>
          <p className="mt-1">{t('removedText')}</p>
        </section>
      ) : null}
      <section>
        <Heading className="font-semibold">{t('keptTitle')}</Heading>
        <p className="mt-1">{t('keptText')}</p>
      </section>
      <p>
        {t('rightsText')}{' '}
        <Link href="/privacy" className="font-semibold text-primary underline">{t('rightsLink')}</Link>.
      </p>
    </div>
  );
}
