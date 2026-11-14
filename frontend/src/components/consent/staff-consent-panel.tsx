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

export function StaffConsentBody({ patientId, role }: StaffConsentProps): ReactNode {
  const consent = usePatientConsent(patientId);
  if (consent.data === undefined) return <QueryFailure query={consent} embedded pending={<ContentSkeleton shape="detail" />} />;
  return (
    <>
      <ConsentStatusView consent={consent.data} scanOfPatient={patientId} />
      {consent.data.active === null ? <ConsentRecordForm patientId={patientId} role={role} canSelfSign={consent.data.patientIsAdult !== false} /> : <div><ConsentRevokeAction patientId={patientId} /></div>}
    </>
  );
}

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
