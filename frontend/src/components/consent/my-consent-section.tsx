'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, CircleX, ShieldCheck, ShieldOff } from 'lucide-react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { ConsentStatusView } from './consent-status-view';
import { consentStateOf, type ConsentState, type PatientConsent } from './consent-types';
import { RevokeConsentDialog } from './revoke-consent-dialog';
import { useMyConsent } from './use-consent';

const HOW_KEY: Readonly<Record<Exclude<ConsentState, 'active'>, string>> = { none: 'noneHow', revoked: 'revokedHow', rejected: 'rejectedHow' };

/** One line that says where the consent stands (B3): the date it has been in force since for an active one, else the state in words. */
function Summary({ consent, state }: { readonly consent: PatientConsent; readonly state: ConsentState }): ReactNode {
  const t = useT('consent');
  const tMine = useT('consent.mine');
  const isActive: boolean = state === 'active';
  const Icon = isActive ? ShieldCheck : ShieldOff;
  return (
    <p role="status" data-testid={`consent-state-${state}`} className="flex items-start gap-2.5 text-base font-semibold">
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', isActive ? 'text-success' : 'text-muted-foreground')} />
      {isActive && consent.active !== null ? tMine('summaryActive', { date: formatDateKey(consent.active.signedAt, 'numeric') }) : t(`state.${state}`)}
    </p>
  );
}

function Body({ consent }: { readonly consent: PatientConsent }): ReactNode {
  const t = useT('consent.mine');
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const detailsId: string = useId();
  const state: ConsentState = consentStateOf(consent);
  const close = useCallback((): void => {
    setIsOpen(false);
    // The revoke button is gone once the status refreshes; the focus must not fall to the page.
    requestAnimationFrame(() => opener.current?.focus());
  }, []);
  return (
    <>
      <Summary consent={consent} state={state} />
      {state === 'active' ? null : <p className="text-sm">{t(HOW_KEY[state])}</p>}
      {/* Progressive disclosure: the law, the facts of the entry, the history and the rare revocation are one click away. */}
      <button
        ref={opener}
        type="button"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-control text-sm font-semibold text-primary-soft-foreground hover:underline"
      >
        {t('details')}
        <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-fast ease-out', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded ? (
        <div id={detailsId} className="flex flex-col gap-3 border-t border-border-soft pt-3">
          <p className="text-xs leading-normal text-muted-foreground">{t('lead')}</p>
          <ConsentStatusView consent={consent} compact />
          {state === 'active' ? (
            <div>
              {/* The negative margin lines the red text up with the text above; the 44 px target stays. */}
              <Button variant="quiet-danger" onClick={() => setIsOpen(true)} className="-ml-4">
                <CircleX aria-hidden="true" className="size-4" />
                {t('revoke')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {isOpen ? <RevokeConsentDialog onClose={close} /> : null}
    </>
  );
}

/**
 * The patient's consent to the electronic record (FR-001, ADR-019) on the profile page, folded to one line (B3): where it
 * stands and, for an active one, since when; «Подробнее» opens the law, the facts, the history and the revocation. Signing is
 * never done here: the consent is a paper form.
 */
export function MyConsentSection(): ReactNode {
  const t = useT('consent');
  const consent = useMyConsent();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="consent-title" id="consent" className="flex flex-col gap-3 p-[22px]">
      <h2 id="consent-title" className="text-lg font-bold">{t('title')}</h2>
      {consent.data === undefined ? <QueryFailure query={consent} embedded pending={<ContentSkeleton shape="detail" />} /> : <Body consent={consent.data} />}
    </Card>
  );
}
