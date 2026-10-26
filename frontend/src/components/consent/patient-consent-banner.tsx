'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/use-t';
import { consentStateOf, type ConsentState } from './consent-types';
import { usePatientConsent } from './use-consent';

const TITLE_KEY: Readonly<Record<Exclude<ConsentState, 'active'>, string>> = { none: 'noneTitle', revoked: 'revokedTitle', rejected: 'rejectedTitle' };

interface PatientConsentBannerProps {
  readonly patientId: string;
  /** Opens the consent management of the page, where the paper consent is recorded. */
  readonly onRecord: () => void;
}

/**
 * The doctor's warning at the top of a patient's page when there is no active consent (ADR-019): an encounter would be
 * refused, so the way out is shown before the doctor tries, as one button (A1). Silent while loading, when the consent is in
 * force and when it cannot be read (the management section reports a failed read).
 */
export function PatientConsentBanner({ patientId, onRecord }: PatientConsentBannerProps): ReactNode {
  const t = useT('consent.banner');
  const consent = usePatientConsent(patientId);
  if (consent.data === undefined) return null;
  const state: ConsentState = consentStateOf(consent.data);
  if (state === 'active') return null;
  return (
    <div role="alert" data-testid="consent-banner" className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-warning bg-warning-soft p-4">
      <div className="min-w-0 flex-1 basis-72">
        <p className="font-semibold">{t(TITLE_KEY[state])}</p>
        <p className="mt-1 text-sm">{t('text')}</p>
      </div>
      <Button onClick={onRecord}>{t('record')}</Button>
    </div>
  );
}
