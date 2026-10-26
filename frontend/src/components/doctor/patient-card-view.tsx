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

/** A patient who does not exist or is outside the doctor's compartment (BR-006 shows both as "not found"): nothing below the header can load either. */
function isUnreachable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const { kind } = errorCodeToUx(error.problem.errorCode);
  return kind === 'not-found' || kind === 'forbidden';
}

/**
 * The doctor's view of one patient (FR-010), arranged for the work of a visit (A1, A2): the patient and where the consent
 * stands on top, then the visits (left) beside a sticky clinical summary (right; first on a phone), and the rare consent
 * paperwork folded at the bottom. The sections load in parallel with the header (same cache entry); if the patient turns out
 * to be unreachable only that one message is shown instead of the whole page.
 */
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
