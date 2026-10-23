'use client';

import type { ReactNode } from 'react';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { PatientConsentBanner } from '@/components/consent/patient-consent-banner';
import { StaffConsentPanel } from '@/components/consent/staff-consent-panel';
import { PatientHeader } from './patient-header';
import { PatientHistoryTimeline } from './patient-history-timeline';
import { PatientPrescriptions } from './patient-prescriptions';
import { QueryErrorState } from '@/components/feedback/query-error-state';
import { RelatedPersons } from './related-persons';
import { usePatient } from './use-doctor-queries';

/** A patient who does not exist or is outside the doctor's compartment (BR-006 shows both as "not found"): nothing below the header can load either. */
function isUnreachable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const { kind } = errorCodeToUx(error.problem.errorCode);
  return kind === 'not-found' || kind === 'forbidden';
}

/**
 * The doctor's view of one patient (FR-010): identity and contacts, trusted persons, finished visits, prescriptions.
 * The sections load in parallel with the header (same cache entry); if the patient turns out to be unreachable only
 * that one message is shown instead of four.
 */
export function PatientCardView({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.patient');
  const patient = usePatient(patientId);
  useDocumentTitle(t('cardLabel'));
  if (patient.isError && isUnreachable(patient.error)) return <QueryErrorState error={patient.error} notFoundText={t('notFound')} />;
  return (
    <>
      <PatientHeader patientId={patientId} />
      <PatientConsentBanner patientId={patientId} />
      <RelatedPersons patientId={patientId} />
      <div className="mt-6"><StaffConsentPanel patientId={patientId} role="DOCTOR" /></div>
      <PatientHistoryTimeline patientId={patientId} />
      <PatientPrescriptions patientId={patientId} />
    </>
  );
}
