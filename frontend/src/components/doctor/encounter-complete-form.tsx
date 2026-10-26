'use client';

import type { ReactNode } from 'react';
import { FormProvider } from 'react-hook-form';
import { ConsentRequiredNotice } from '@/components/consent/consent-required-notice';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { useT } from '@/lib/i18n/use-t';
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

interface FailureProps {
  readonly problem: ProblemDetails;
  /** What the server said about fields this form does not have; shown because the banner would otherwise hide it. */
  readonly foreignMessages: ReadonlyArray<string>;
  readonly isMarked: boolean;
}

/** A failed completion: the localized headline and code, plus a pointer to the fields marked in the form. */
function CompletionFailure({ problem, foreignMessages, isMarked }: FailureProps): ReactNode {
  const t = useT('doctor.encounter');
  const detail: string | undefined = isMarked ? t('fixMarkedFields') : foreignMessages.length > 0 ? foreignMessages.join('. ') : problem.detail;
  return (
    <div className="mt-4">
      <ProblemBanner problem={problem} detail={detail} />
    </div>
  );
}

/**
 * The completion form (FR-011…FR-014), in the order of the visit (A6): examination and vital signs, diagnoses, ordered
 * services, drugs, then the conclusion and recommendations; one atomic submit (API 7.3). Client rules mirror the server's;
 * what only the server knows (a code outside the terminology seed, a replay) comes back as problem+json and is shown on the
 * field or as the read-only view. While the doctor works the form is kept as a local draft, and the actions stay at the
 * bottom of the screen (A8).
 */
export function EncounterCompleteForm({ encounterId, patientId }: { readonly encounterId: string; readonly patientId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const { methods, complete, onSubmit, completeAsEmergency, foreignMessages, isMarked, draft, startOver } = useEncounterForm(encounterId);
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
        <EncounterActionBar status={draft.status} onSaveDraft={draft.saveNow} isCompleting={complete.isPending} />
      </form>
      {/* Outside the form: the notice has a form of its own, and a nested one would submit the completion. */}
      {needsConsent ? <div className="mt-4"><ConsentRequiredNotice action="complete" patientId={patientId} isPending={complete.isPending} onEmergency={completeAsEmergency} /></div> : null}
    </FormProvider>
  );
}
