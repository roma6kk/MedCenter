'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ForbiddenState, NotFoundState } from '@/components/feedback/states';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';

const HOME_LINK_CLASS = 'mt-4 inline-flex min-h-[44px] items-center rounded-[6px] border border-[var(--border)] px-4 py-2';

/** The frame of a screen outside every route group (404, 403, a crashed page): one skip link and the `<main>` it targets. */
function MessageFrame({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <>
      <SkipLink />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-xl p-8 focus:outline-none">{children}</main>
    </>
  );
}

function HomeLink(): ReactNode {
  const t = useT('common');
  return <Link href="/" className={HOME_LINK_CLASS}>{t('backHome')}</Link>;
}

/** `app/not-found.tsx`: a URL no route answers to. */
export function NotFoundPage(): ReactNode {
  const t = useT('feedback');
  useDocumentTitle(t('notFoundPage'));
  return (
    <MessageFrame>
      <NotFoundState title={t('notFoundPage')} action={<HomeLink />} />
    </MessageFrame>
  );
}

/** `app/403/page.tsx`: where the role guard sends a signed-in user who opened another role's section. */
export function ForbiddenPage(): ReactNode {
  const t = useT('feedback');
  useDocumentTitle(t('forbiddenTitle'));
  return (
    <MessageFrame>
      <ForbiddenState title={t('forbiddenPage')} action={<HomeLink />} />
    </MessageFrame>
  );
}

interface RouteErrorPageProps {
  readonly error: Error;
  readonly reset: () => void;
}

/** `app/error.tsx`: a page crashed while rendering. The error text is for support, not a translation: it is shown as it came. */
export function RouteErrorPage({ error, reset }: RouteErrorPageProps): ReactNode {
  const t = useT('feedback');
  const tCommon = useT('common');
  useDocumentTitle(t('errorTitle'));
  return (
    <MessageFrame>
      <ProblemBanner title={t('errorTitle')} detail={error.message} errorCode="INTERNAL" />
      <button type="button" onClick={reset} className="mt-4 min-h-[44px] rounded-[6px] border border-[var(--border)] px-4 py-2">
        {tCommon('retry')}
      </button>
    </MessageFrame>
  );
}
