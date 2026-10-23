'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { ConsentRecordForm } from './consent-record-form';
import { ConsentRevokeForm } from './consent-revoke-form';
import { ConsentStatusView } from './consent-status-view';
import { usePatientConsent } from './use-consent';

interface StaffConsentPanelProps {
  readonly patientId: string;
  readonly role: 'ADMIN' | 'DOCTOR';
}

/**
 * The consent of one patient for staff (ADR-019): status and history (API 3.7), the scans (3.11), the form that records a
 * paper consent or refusal (3.10 + 3.8) and the written revocation (3.9). ADMIN and a DOCTOR linked to the patient use the same
 * panel; the page around it decides what else is shown, and for ADMIN that is nothing medical (ADR-018).
 */
export function StaffConsentPanel({ patientId, role }: StaffConsentPanelProps): ReactNode {
  const t = useT('consent');
  const tStaff = useT('consent.staff');
  const consent = usePatientConsent(patientId);
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="staff-consent-title" id="consent" className="flex flex-col gap-3 p-[22px]">
      <h2 id="staff-consent-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-[13px] leading-normal text-muted-foreground">{tStaff('lead')}</p>
      {role === 'ADMIN' ? <p className="text-[13px] leading-normal text-muted-foreground">{tStaff('adminNote')}</p> : null}
      {consent.data === undefined ? (
        <QueryFailure query={consent} embedded pending={<TableSkeleton />} />
      ) : (
        <>
          <ConsentStatusView consent={consent.data} scanOfPatient={patientId} />
          {consent.data.active === null ? null : <ConsentRevokeForm patientId={patientId} />}
          <ConsentRecordForm patientId={patientId} role={role} />
        </>
      )}
    </Card>
  );
}
