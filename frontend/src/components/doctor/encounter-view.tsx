'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TableSkeleton } from '@/components/feedback/states';
import { Dialog } from '@/components/ui/dialog';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import type { EncounterDetails } from './doctor-types';
import { EncounterCompleteForm } from './encounter-complete-form';
import { EncounterHeader } from './encounter-header';
import { EncounterPatientBar } from './encounter-patient-bar';
import { PatientSummary } from './patient-summary';
import { EncounterReadOnly } from './encounter-readonly';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useEncounter } from './use-doctor-queries';

/**
 * The form disappears under the doctor's hands when the visit is completed (their own submit, or a replay that the service
 * refuses with 409): the pressed button is gone and the page is scrolled to its bottom. Focus goes to the banner that says why,
 * so it is read out and in view. A finished visit that is simply opened keeps the default focus.
 */
function useFocusBannerOnFinish(status: EncounterDetails['status']): RefObject<HTMLParagraphElement> {
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (status === 'in-progress') wasEditing.current = true;
    if (status === 'finished' && wasEditing.current) {
      wasEditing.current = false;
      bannerRef.current?.focus();
    }
  }, [status]);
  return bannerRef;
}

function FinishedBanner({ bannerRef }: { readonly bannerRef: RefObject<HTMLParagraphElement> }): ReactNode {
  const t = useT('doctor.encounter');
  return (
    <p ref={bannerRef} tabIndex={-1} role="status" data-testid="encounter-readonly" className="mt-4 rounded-card border border-success bg-success-soft p-4 text-sm">
      <strong>{t('finishedTitle')}</strong> {t('finishedHint')}
    </p>
  );
}

function EncounterBody({ encounter }: { readonly encounter: EncounterDetails }): ReactNode {
  const t = useT('doctor.encounter');
  const bannerRef = useFocusBannerOnFinish(encounter.status);
  if (encounter.status === 'in-progress') return <div className="mt-4"><EncounterCompleteForm encounterId={encounter.id} patientId={encounter.patientId} /></div>;
  if (encounter.status === 'finished') {
    return (
      <>
        <FinishedBanner bannerRef={bannerRef} />
        <div className="mt-4"><EncounterReadOnly encounter={encounter} /></div>
      </>
    );
  }
  return <p role="status" className="mt-4 rounded-card border border-border bg-card p-4 text-sm">{t('notEditable', { status: encounter.status })}</p>;
}

/**
 * `/encounters/[encounterId]` (FR-011…FR-014): the form while the visit is in progress, the read-only record once it is finished.
 * The patient stays in view while the doctor works (A3): a bar that sticks to the top, and the same summary as the patient's card
 * in a column beside the form from 1024 px up, in a drawer below it.
 */
export function EncounterView({ encounterId }: { readonly encounterId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const encounter = useEncounter(encounterId);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  useDocumentTitle(t('title'));
  return (
    <>
      {encounter.data === undefined ? <QueryFailure query={encounter} notFoundText={t('notFound')} pending={<TableSkeleton />} /> : null}
      {encounter.data ? (
        <>
          <EncounterPatientBar patientId={encounter.data.patientId} onOpenSummary={() => setIsSummaryOpen(true)} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
            <div className="min-w-0">
              <EncounterHeader encounter={encounter.data} />
              <EncounterBody encounter={encounter.data} />
            </div>
            <aside aria-label={t('patientSummary')} className="no-print hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
              <PatientSummary patientId={encounter.data.patientId} excludeAppointmentId={encounter.data.appointmentId} />
            </aside>
          </div>
          {isSummaryOpen ? (
            <Dialog title={t('patientSummary')} variant="drawer" onClose={() => setIsSummaryOpen(false)}>
              <PatientSummary patientId={encounter.data.patientId} excludeAppointmentId={encounter.data.appointmentId} plain className="mt-2" />
            </Dialog>
          ) : null}
        </>
      ) : null}
    </>
  );
}
