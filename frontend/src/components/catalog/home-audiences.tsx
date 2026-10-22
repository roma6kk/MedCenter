'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';
import { CLINIC_CONTACTS, CORPORATE_CLIENTS, HOME_ANCHORS, INSURANCE_PARTNERS } from './home-content';

const PARTNERS_ID = 'partners';
const AUDIENCE_LINK_CLASS = 'mt-auto inline-flex min-h-[44px] items-center text-[15px] font-semibold text-inverse-accent underline-offset-4 hover:underline';

interface AudienceProps {
  readonly title: string;
  readonly text: string;
  readonly href: string;
  readonly link: string;
}

function Audience({ title, text, href, link }: AudienceProps): ReactNode {
  return (
    <li>
      <article className="flex h-full flex-col gap-3 rounded-panel border border-inverse-border p-6">
        <h3 className="text-[22px] font-bold">{title}</h3>
        <p className="text-[15px] leading-relaxed text-inverse-muted">{text}</p>
        <Link href={href} className={AUDIENCE_LINK_CLASS}>{link}</Link>
      </article>
    </li>
  );
}

function Chips({ label, names }: { readonly label: string; readonly names: ReadonlyArray<string> }): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-inverse-muted">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {names.map((name) => (
          <li key={name} className="rounded-full border border-inverse-border px-4 py-2 text-[15px] font-medium">{name}</li>
        ))}
      </ul>
    </div>
  );
}

/** Who the clinic serves — private patients, companies, insured patients — with the companies and insurers it works with. */
export function HomeAudiences(): ReactNode {
  const t = useT('home');
  return (
    <section id={HOME_ANCHORS.companies} aria-labelledby="home-audiences" className="scroll-mt-4 bg-inverse text-inverse-foreground">
      <div className={`${SECTION_CLASS} flex flex-col gap-8 py-16`}>
        <h2 id="home-audiences" className={SECTION_TITLE_CLASS}>{t('audTitle')}</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          <Audience title={t('audPrivateTitle')} text={t('audPrivateText')} href="/booking" link={t('book')} />
          <Audience title={t('audCorpTitle')} text={t('audCorpText')} href={`mailto:${CLINIC_CONTACTS.corporateEmail}`} link={t('audCorpLink')} />
          <Audience title={t('audInsTitle')} text={t('audInsText')} href={`#${PARTNERS_ID}`} link={t('audInsLink')} />
        </ul>
        <div id={PARTNERS_ID} className="scroll-mt-4 flex flex-col gap-6 border-t border-inverse-border pt-8">
          <h3 className="text-xl font-bold">{t('partnersTitle')}</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <Chips label={t('partnersCorp')} names={CORPORATE_CLIENTS} />
            <Chips label={t('partnersIns')} names={INSURANCE_PARTNERS} />
          </div>
          <p className="text-sm text-inverse-muted">{t('demoNote')}</p>
        </div>
      </div>
    </section>
  );
}
