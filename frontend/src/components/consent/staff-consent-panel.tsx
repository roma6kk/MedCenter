'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { ConsentRecordForm } from './consent-record-form';
import { ConsentRevokeAction } from './consent-revoke-action';
import { ConsentStatusView } from './consent-status-view';
import { usePatientConsent } from './use-consent';

interface StaffConsentProps {
  readonly patientId: string;
  readonly role: 'ADMIN' | 'DOCTOR';
}

/**
 * The working part of the staff's consent view (ADR-019): status and history (API 3.7) with the scans (3.11), and then only
 * what the state allows (A1): while a consent is in force the one relevant act is its written revocation (3.9); without one
 * it is the form that records a paper consent or refusal (3.10 + 3.8). Offering both at once made a rare form the first thing
 * on the screen.
 */
export function StaffConsentBody({ patientId, role }: StaffConsentProps): ReactNode {
  const consent = usePatientConsent(patientId);
  if (consent.data === undefined) return <QueryFailure query={consent} embedded pending={<ContentSkeleton shape="detail" />} />;
  return (
    <>
      <ConsentStatusView consent={consent.data} scanOfPatient={patientId} />
      {consent.data.active === null ? <ConsentRecordForm patientId={patientId} role={role} /> : <div><ConsentRevokeAction patientId={patientId} /></div>}
    </>
  );
}

/**
 * The consent of one patient as a card of its own, for ADMIN (ADR-018: a page of nothing but the paperwork). A DOCTOR reaches
 * the same body through the folded section of the patient's card.
 */
export function StaffConsentPanel({ patientId, role }: StaffConsentProps): ReactNode {
  const t = useT('consent');
  const tStaff = useT('consent.staff');
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="staff-consent-title" id="consent" className="flex flex-col gap-3 p-[22px]">
      <h2 id="staff-consent-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-xs leading-normal text-muted-foreground">{tStaff('lead')}</p>
      {role === 'ADMIN' ? <p className="text-xs leading-normal text-muted-foreground">{tStaff('adminNote')}</p> : null}
      <StaffConsentBody patientId={patientId} role={role} />
    </Card>
  );
}
