'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Compass, RefreshCw, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';

type Tone = 'primary' | 'warning' | 'destructive';

const TILE_TONE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  warning: 'bg-warning-soft text-warning',
  destructive: 'bg-destructive-soft text-destructive',
};

/** The frame of a screen outside every route group (404, 403, a crashed page): one skip link and the `<main>` it targets. */
function MessageFrame({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <>
      <SkipLink />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-10 focus:outline-none">
        {children}
      </main>
    </>
  );
}

function IconTile({ icon: Icon, tone }: { readonly icon: LucideIcon; readonly tone: Tone }): ReactNode {
  return (
    <span aria-hidden="true" className={cn('inline-flex h-16 w-16 items-center justify-center rounded-card', TILE_TONE[tone])}>
      <Icon className="h-8 w-8" />
    </span>
  );
}

interface MessageProps {
  readonly testId: string;
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}

/** Calm centred message: icon tile, a clear title, one sentence and the way out. */
function Message({ testId, icon, tone, title, description, children }: MessageProps): ReactNode {
  return (
    <div data-testid={testId} className="w-full rounded-panel border border-border bg-card p-8 text-center sm:p-10">
      <IconTile icon={icon} tone={tone} />
      <h1 className="mt-5 text-[28px] font-bold leading-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function HomeLink({ variant }: { readonly variant: 'primary' | 'secondary' }): ReactNode {
  const t = useT('common');
  return <Link href="/" className={buttonVariants({ variant, size: 'lg' })}>{t('backHome')}</Link>;
}

/** `app/not-found.tsx`: a URL no route answers to. */
export function NotFoundPage(): ReactNode {
  const t = useT('feedback');
  useDocumentTitle(t('notFoundPage'));
  return (
    <MessageFrame>
      <Message testId="not-found-state" icon={Compass} tone="primary" title={t('notFoundTitle')} description={t('notFoundPage')}>
        <div className="mt-6 flex justify-center"><HomeLink variant="primary" /></div>
      </Message>
    </MessageFrame>
  );
}

/** `app/403/page.tsx`: where the role guard sends a signed-in user who opened another role's section. */
export function ForbiddenPage(): ReactNode {
  const t = useT('feedback');
  useDocumentTitle(t('forbiddenTitle'));
  return (
    <MessageFrame>
      <Message testId="forbidden-state" icon={ShieldAlert} tone="warning" title={t('forbiddenTitle')} description={t('forbiddenPage')}>
        <div className="mt-6 flex justify-center"><HomeLink variant="primary" /></div>
      </Message>
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
      <div className="w-full rounded-panel border border-border bg-card p-8 sm:p-10">
        <div className="text-center"><IconTile icon={TriangleAlert} tone="destructive" /></div>
        <div className="mt-5 text-left">
          <ProblemBanner title={t('errorTitle')} detail={error.message} errorCode="INTERNAL" />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={reset}><RefreshCw aria-hidden="true" className="h-4 w-4" />{tCommon('retry')}</Button>
          <HomeLink variant="secondary" />
        </div>
      </div>
    </MessageFrame>
  );
}
