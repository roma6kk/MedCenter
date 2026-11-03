'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useCanBook } from '@/hooks/use-can-book';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';
import { CORPORATE_CLIENTS, HOME_ANCHORS, INSURANCE_PARTNERS } from './home-content';

const AUDIENCE_LINK_CLASS = 'mt-auto inline-flex min-h-[44px] items-center text-base font-semibold text-inverse-accent underline-offset-4 hover:underline';

interface AudienceProps {
  readonly title: string;
  readonly text: string;
  /** Both or neither: a block without a real destination carries no link. */
  readonly action?: { readonly href: string; readonly label: string };
}

function Audience({ title, text, action }: AudienceProps): ReactNode {
  return (
    <li>
      <article className="flex h-full flex-col gap-3 rounded-panel border border-inverse-border p-6">
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-base leading-relaxed text-inverse-muted">{text}</p>
        {action && <Link href={action.href} className={AUDIENCE_LINK_CLASS}>{action.label}</Link>}
      </article>
    </li>
  );
}

/** Names as plain wordmarks (C8): no border or ground, so nothing looks like a filter or a button that does not click. */
function Wordmarks({ label, names }: { readonly label: string; readonly names: ReadonlyArray<string> }): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-inverse-muted">{label}</h3>
      <ul className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        {names.map((name) => (
          <li key={name} className="text-xl font-semibold tracking-tight text-inverse-foreground">{name}</li>
        ))}
      </ul>
    </div>
  );
}

/** Who the clinic serves — private patients, companies, insured patients — with the companies and insurers it works with. Staff do not book, so the private-patients block carries no booking link for them. */
export function HomeAudiences(): ReactNode {
  const t = useT('home');
  const canBook = useCanBook();
  return (
    <section id={HOME_ANCHORS.companies} aria-labelledby="home-audiences" className="scroll-mt-4 bg-inverse text-inverse-foreground">
      <div className={`${SECTION_CLASS} reveal-on-scroll flex flex-col gap-8 py-16`}>
        <h2 id="home-audiences" className={SECTION_TITLE_CLASS}>{t('audTitle')}</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          <Audience title={t('audPrivateTitle')} text={t('audPrivateText')} action={canBook ? { href: '/booking', label: t('book') } : undefined} />
          <Audience title={t('audCorpTitle')} text={t('audCorpText')} />
          <Audience title={t('audInsTitle')} text={t('audInsText')} />
        </ul>
        <div className="flex flex-col gap-6 border-t border-inverse-border pt-8">
          <h3 className="text-xl font-bold">{t('partnersTitle')}</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <Wordmarks label={t('partnersCorp')} names={CORPORATE_CLIENTS} />
            <Wordmarks label={t('partnersIns')} names={INSURANCE_PARTNERS} />
          </div>
        </div>
      </div>
    </section>
  );
}
