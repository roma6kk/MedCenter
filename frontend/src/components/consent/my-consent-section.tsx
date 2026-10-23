'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { ConsentStatusView } from './consent-status-view';
import { consentStateOf, type ConsentState, type PatientConsent } from './consent-types';
import { RevokeConsentDialog } from './revoke-consent-dialog';
import { useMyConsent } from './use-consent';

const HOW_KEY: Readonly<Record<Exclude<ConsentState, 'active'>, string>> = { none: 'noneHow', revoked: 'revokedHow', rejected: 'rejectedHow' };

function Body({ consent }: { readonly consent: PatientConsent }): ReactNode {
  const t = useT('consent.mine');
  const [isOpen, setIsOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const state: ConsentState = consentStateOf(consent);
  const close = useCallback((): void => {
    setIsOpen(false);
    // The revoke button is gone once the status refreshes; the focus must not fall to the page.
    requestAnimationFrame(() => opener.current?.focus());
  }, []);
  return (
    <>
      <ConsentStatusView consent={consent} />
      {state === 'active' ? null : <p className="mt-3 text-sm">{t(HOW_KEY[state])}</p>}
      {state === 'active' ? (
        <div className="mt-4">
          <button ref={opener} type="button" onClick={() => setIsOpen(true)} className={buttonVariants({ variant: 'danger' })}>{t('revoke')}</button>
        </div>
      ) : null}
      {isOpen ? <RevokeConsentDialog onClose={close} /> : null}
    </>
  );
}

/**
 * The patient's consent to the electronic record (FR-001, ADR-019) on the profile page: where it stands, the history, how to sign
 * it at the front desk when there is none, and the revocation. Signing is never done here: the consent is a paper form.
 */
export function MyConsentSection(): ReactNode {
  const t = useT('consent');
  const tMine = useT('consent.mine');
  const consent = useMyConsent();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="consent-title" id="consent" className="flex flex-col gap-3 p-[22px]">
      <h2 id="consent-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-[13px] leading-normal text-muted-foreground">{tMine('lead')}</p>
      {consent.data === undefined ? <QueryFailure query={consent} embedded pending={<TableSkeleton />} /> : <Body consent={consent.data} />}
    </Card>
  );
}
