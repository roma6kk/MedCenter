'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/use-t';
import { consentStateOf, type ConsentState } from './consent-types';
import { usePatientConsent } from './use-consent';

const TITLE_KEY: Readonly<Record<Exclude<ConsentState, 'active'>, string>> = { none: 'noneTitle', revoked: 'revokedTitle', rejected: 'rejectedTitle' };

interface PatientConsentBannerProps {
  readonly patientId: string;
  readonly onRecord: () => void;
}

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
