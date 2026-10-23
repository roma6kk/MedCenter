'use client';

import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { consentStateOf, type ConsentState } from './consent-types';
import { usePatientConsent } from './use-consent';

const TITLE_KEY: Readonly<Record<Exclude<ConsentState, 'active'>, string>> = { none: 'noneTitle', revoked: 'revokedTitle', rejected: 'rejectedTitle' };

/**
 * The doctor's warning at the top of a patient's page when there is no active consent (ADR-019): an encounter would be
 * refused, so the way out is shown before the doctor tries. Silent while loading, when the consent is in force and when it
 * cannot be read (the consent panel below reports a failed read).
 */
export function PatientConsentBanner({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('consent.banner');
  const consent = usePatientConsent(patientId);
  if (consent.data === undefined) return null;
  const state: ConsentState = consentStateOf(consent.data);
  if (state === 'active') return null;
  return (
    <div role="alert" data-testid="consent-banner" className="mt-4 rounded-card border border-warning bg-warning-soft p-4">
      <p className="font-semibold">{t(TITLE_KEY[state])}</p>
      <p className="mt-1 text-sm">{t('text')}</p>
      <a href="#consent" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}>{t('goTo')}</a>
    </div>
  );
}
