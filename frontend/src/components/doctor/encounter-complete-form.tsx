'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FormProvider } from 'react-hook-form';
import { ConsentRequiredNotice } from '@/components/consent/consent-required-notice';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';
import { motionSafeScrollBehavior } from '@/lib/ui/motion';
import { CancelEncounterDialog } from './cancel-encounter-dialog';
import { ConclusionSection } from './conclusion-section';
import { DiagnosesEditor } from './diagnoses-editor';
import { EncounterActionBar } from './encounter-action-bar';
import { EncounterDraftNotice } from './encounter-draft-notice';
import { blockImplicitSubmit } from './encounter-form-helpers';
import { SectionNavigator } from './encounter-section-nav';
import { MedicationsEditor } from './medications-editor';
import { ObservationsEditor } from './observations-editor';
import { ServiceRequestsEditor } from './service-requests-editor';
import { useEncounterForm } from './use-encounter-form';

function ScrollToFailure({ isActive = true, className, children }: { readonly isActive?: boolean; readonly className: string; readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isActive) return;
    ref.current?.scrollIntoView?.({ block: 'center', behavior: motionSafeScrollBehavior() });
    ref.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} tabIndex={-1} className={`${className} focus:outline-none`}>{children}</div>;
}

interface FailureProps {
  readonly problem: ProblemDetails;
  readonly foreignMessages: ReadonlyArray<string>;
  readonly isMarked: boolean;
}

function CompletionFailure({ problem, foreignMessages, isMarked }: FailureProps): ReactNode {
  const t = useT('doctor.encounter');
  const detail: string | undefined = isMarked ? t('fixMarkedFields') : foreignMessages.length > 0 ? foreignMessages.join('. ') : problem.detail;
  return (
    <ScrollToFailure isActive={!isMarked} className="mt-4">
      <ProblemBanner problem={problem} detail={detail} />
    </ScrollToFailure>
  );
}

interface EncounterCompleteFormProps {
  readonly encounterId: string;
  readonly appointmentId: string;
  readonly patientId: string;
}

export function EncounterCompleteForm({ encounterId, appointmentId, patientId }: EncounterCompleteFormProps): ReactNode {
  const t = useT('doctor.encounter');
  const { methods, complete, onSubmit, completeAsEmergency, foreignMessages, isMarked, draft, startOver } = useEncounterForm(encounterId);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const needsConsent: boolean = complete.isError && isApiError(complete.error) && complete.error.errorCode === 'CONSENT_REQUIRED';

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} onKeyDown={blockImplicitSubmit} aria-label={t('formLabel')} noValidate>
        {draft.restoredAt === null ? null : <EncounterDraftNotice savedAt={draft.restoredAt} onDismiss={draft.dismissRestored} onStartOver={startOver} />}
        <SectionNavigator />
        <div className="grid gap-4">
          <ObservationsEditor />
          <DiagnosesEditor patientId={patientId} />
          <ServiceRequestsEditor />
          <MedicationsEditor />
          <ConclusionSection />
        </div>
        {complete.isError && !needsConsent && isApiError(complete.error) ? <CompletionFailure problem={complete.error.problem} foreignMessages={foreignMessages} isMarked={isMarked} /> : null}
        <EncounterActionBar status={draft.status} onSaveDraft={draft.saveNow} isCompleting={complete.isPending} onCancelEncounter={() => setIsCancelOpen(true)} />
      </form>
      {/* Outside the form: a nested form would submit the completion. */}
      {needsConsent ? <ScrollToFailure className="mt-4"><ConsentRequiredNotice action="complete" patientId={patientId} isPending={complete.isPending} onEmergency={completeAsEmergency} /></ScrollToFailure> : null}
      {isCancelOpen ? <CancelEncounterDialog encounterId={encounterId} appointmentId={appointmentId} onDiscardDraft={draft.forget} onClose={() => setIsCancelOpen(false)} /> : null}
    </FormProvider>
  );
}
