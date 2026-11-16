'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { Dialog } from '@/components/ui/dialog';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { clearDraft } from '@/lib/encounter-draft';
import { useT } from '@/lib/i18n/use-t';
import type { EncounterDetails } from './doctor-types';
import { EncounterAsideSlotContext } from './encounter-aside-slot';
import { EncounterCompleteForm } from './encounter-complete-form';
import { EncounterHeader } from './encounter-header';
import { EncounterPatientBar } from './encounter-patient-bar';
import { PatientSummary } from './patient-summary';
import { EncounterReadOnly } from './encounter-readonly';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useEncounter } from './use-doctor-queries';
import { isOwnVisit, useOwnRoleId } from './use-own-role';

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
  const ownRoleId = useOwnRoleId();
  // A visit finished elsewhere (replay 409) never ran this form's success path: clear its stale local draft here.
  useEffect(() => {
    if (encounter.status === 'finished') clearDraft(encounter.id);
  }, [encounter.status, encounter.id]);
  if (encounter.status === 'in-progress' && !isOwnVisit(encounter, ownRoleId)) return <p role="status" className="mt-4 rounded-card border border-border bg-card p-4 text-sm">{t('notYours')}</p>;
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

export function EncounterView({ encounterId }: { readonly encounterId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const encounter = useEncounter(encounterId);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [asideSlot, setAsideSlot] = useState<HTMLElement | null>(null);
  useDocumentTitle(t('title'));
  return (
    <EncounterAsideSlotContext.Provider value={asideSlot}>
      {encounter.data === undefined ? <QueryFailure query={encounter} notFoundText={t('notFound')} pending={<ContentSkeleton shape="detail" />} /> : null}
      {encounter.data ? (
        <div className="animate-fade-in">
          <EncounterPatientBar patientId={encounter.data.patientId} startedAt={encounter.data.status === 'in-progress' ? encounter.data.period.start : undefined} onOpenSummary={() => setIsSummaryOpen(true)} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
            <div className="min-w-0">
              <EncounterHeader encounter={encounter.data} />
              <EncounterBody encounter={encounter.data} />
            </div>
            <div className="no-print hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
              <div ref={setAsideSlot} />
              <aside aria-label={t('patientSummary')}>
                <PatientSummary patientId={encounter.data.patientId} excludeAppointmentId={encounter.data.appointmentId} />
              </aside>
            </div>
          </div>
          {isSummaryOpen ? (
            <Dialog title={t('patientSummary')} variant="drawer" onClose={() => setIsSummaryOpen(false)}>
              <PatientSummary patientId={encounter.data.patientId} excludeAppointmentId={encounter.data.appointmentId} plain className="mt-2" />
            </Dialog>
          ) : null}
        </div>
      ) : null}
    </EncounterAsideSlotContext.Provider>
  );
}
