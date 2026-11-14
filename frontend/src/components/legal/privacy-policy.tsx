'use client';

import type { ReactNode } from 'react';
import { CLINIC_CONTACTS, CLINIC_LEGAL } from '@/components/catalog/home-content';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { POLICY_DATE, POLICY_VERSION } from '@/lib/policy-version';

interface Purpose {
  readonly id: string;
  readonly title: string;
  readonly data: string;
  readonly basis: string;
}

interface CookieRow {
  readonly name: string;
  readonly purpose: string;
  readonly lifetime: string;
}

const H2_CLASS = 'mt-10 text-xl font-semibold tracking-tight';
const P_CLASS = 'mt-3 text-base leading-relaxed';

export function PrivacyPolicy(): ReactNode {
  const t = useT('privacy');
  const home = useT('home');
  useDocumentTitle(t('title'));

  const purposes: ReadonlyArray<Purpose> = [
    { id: 'account', title: t('purposeAccountTitle'), data: t('purposeAccountData'), basis: t('purposeAccountBasis') },
    { id: 'booking', title: t('purposeBookingTitle'), data: t('purposeBookingData'), basis: t('purposeBookingBasis') },
    { id: 'clinic', title: t('purposeClinicTitle'), data: t('purposeClinicData'), basis: t('purposeClinicBasis') },
    { id: 'security', title: t('purposeSecurityTitle'), data: t('purposeSecurityData'), basis: t('purposeSecurityBasis') },
  ];
  const cookies: ReadonlyArray<CookieRow> = [
    { name: 'mc_rt', purpose: t('cookieRefreshPurpose'), lifetime: t('cookieRefreshLifetime') },
    { name: 'mc_at', purpose: t('cookieAccessPurpose'), lifetime: t('cookieAccessLifetime') },
    { name: 'mc_session', purpose: t('cookieSessionPurpose'), lifetime: t('cookieSessionLifetime') },
    { name: 'mc_pkce', purpose: t('cookiePkcePurpose'), lifetime: t('cookiePkceLifetime') },
    { name: 'mc-locale', purpose: t('cookieLocalePurpose'), lifetime: t('cookieLocaleLifetime') },
  ];

  return (
    <article className="max-w-3xl" aria-labelledby="privacy-title">
      <h1 id="privacy-title" className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p role="note" className="mt-4 rounded-card border border-border bg-card px-4 py-3 text-sm font-medium">{t('trainingNote')}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t('versionLine', { version: POLICY_VERSION, date: POLICY_DATE })}</p>

      <section aria-labelledby="privacy-operator">
        <h2 id="privacy-operator" className={H2_CLASS}>{t('operatorTitle')}</h2>
        <p className={P_CLASS}>
          {t('operatorText', { name: CLINIC_LEGAL.name, unp: CLINIC_LEGAL.unp, address: home('contactAddressValue'), email: CLINIC_CONTACTS.email, phone: CLINIC_CONTACTS.phone })}
        </p>
      </section>

      <section aria-labelledby="privacy-purposes">
        <h2 id="privacy-purposes" className={H2_CLASS}>{t('purposesTitle')}</h2>
        <p className={P_CLASS}>{t('purposesLead')}</p>
        <div className="mt-4 flex flex-col gap-4">
          {purposes.map((purpose) => (
            <div key={purpose.id} data-testid={`purpose-${purpose.id}`} className="rounded-card border border-border bg-card p-4">
              <h3 className="font-semibold">{purpose.title}</h3>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-4">
                <dt className="text-muted-foreground">{t('fieldData')}</dt>
                <dd>{purpose.data}</dd>
                <dt className="text-muted-foreground">{t('fieldBasis')}</dt>
                <dd>{purpose.basis}</dd>
                <dt className="text-muted-foreground">{t('fieldRetention')}</dt>
                <dd>{t('retentionConsent')}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies" className={H2_CLASS}>{t('cookiesTitle')}</h2>
        <p className={P_CLASS}>{t('cookiesLead')}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">{t('cookieName')}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t('cookiePurpose')}</th>
                <th scope="col" className="py-2 font-medium">{t('cookieLifetime')}</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((cookie) => (
                <tr key={cookie.name} className="border-b border-border">
                  <td className="py-2 pr-4 font-mono">{cookie.name}</td>
                  <td className="py-2 pr-4">{cookie.purpose}</td>
                  <td className="py-2">{cookie.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={P_CLASS}>{t('cookiesStorage')}</p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights" className={H2_CLASS}>{t('rightsTitle')}</h2>
        <p className={P_CLASS}>{t('rightsLead')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
          <li>{t('rightInfo')}</li>
          <li>{t('rightChange')}</li>
          <li>{t('rightWithdraw')}</li>
          <li>{t('rightDelete')}</li>
        </ul>
        <p className={P_CLASS}>{t('rightsHow')}</p>
      </section>

      <section aria-labelledby="privacy-consequences">
        <h2 id="privacy-consequences" className={H2_CLASS}>{t('consequencesTitle')}</h2>
        <p className={P_CLASS}>{t('consequencesText')}</p>
      </section>

      <section aria-labelledby="privacy-cross-border">
        <h2 id="privacy-cross-border" className={H2_CLASS}>{t('crossBorderTitle')}</h2>
        <p className={P_CLASS}>{t('crossBorderText')}</p>
      </section>
    </article>
  );
}
