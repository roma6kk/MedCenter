'use client';

import type { ReactNode } from 'react';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { ConsentManagementSection, useConsentManagement } from '@/components/consent/consent-management-section';
import { PatientConsentBanner } from '@/components/consent/patient-consent-banner';
import { PatientHeader } from './patient-header';
import { PatientHistoryTimeline } from './patient-history-timeline';
import { PatientPrescriptions } from './patient-prescriptions';
import { PatientSummary } from './patient-summary';
import { QueryErrorState } from '@/components/feedback/query-error-state';
import { usePatient } from './use-doctor-queries';

function isUnreachable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const { kind } = errorCodeToUx(error.problem.errorCode);
  return kind === 'not-found' || kind === 'forbidden';
}

export function PatientCardView({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.patient');
  const patient = usePatient(patientId);
  const consent = useConsentManagement();
  useDocumentTitle(t('cardLabel'));
  if (patient.isError && isUnreachable(patient.error)) return <QueryErrorState error={patient.error} notFoundText={t('notFound')} />;
  return (
    <>
      <PatientHeader patientId={patientId} onManageConsent={consent.reveal} />
      <PatientConsentBanner patientId={patientId} onRecord={consent.reveal} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <PatientSummary patientId={patientId} className="lg:sticky lg:top-4 lg:order-2 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto" />
        <div className="flex min-w-0 flex-col gap-8 lg:order-1">
          <PatientHistoryTimeline patientId={patientId} />
          <PatientPrescriptions patientId={patientId} />
        </div>
      </div>
      <ConsentManagementSection patientId={patientId} management={consent} />
    </>
  );
}
