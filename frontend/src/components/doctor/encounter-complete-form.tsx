'use client';

import type { ReactNode } from 'react';
import { FormProvider, useFormContext, useFormState } from 'react-hook-form';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { RECOMMENDATIONS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { DiagnosesEditor } from './diagnoses-editor';
import { a11yOf, blockImplicitSubmit, errorAt, FIELDSET_CLASS, INPUT_CLASS } from './encounter-form-helpers';
import { FieldRow } from './encounter-form-fields';
import { MedicationsEditor } from './medications-editor';
import { ObservationsEditor } from './observations-editor';
import { ServiceRequestsEditor } from './service-requests-editor';
import { useEncounterForm } from './use-encounter-form';

function RecommendationsSection(): ReactNode {
  const t = useT('doctor.encounter');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: 'recommendations' });
  const error = errorAt(errors, 'recommendations');
  return (
    <fieldset className={`mt-4 ${FIELDSET_CLASS}`}>
      <legend className="px-1 font-semibold">{t('recommendationsLegend')}</legend>
      <FieldRow id="recommendations" label={t('recommendations')} error={error}>
        <textarea id="recommendations" rows={3} maxLength={RECOMMENDATIONS_MAX} {...register('recommendations')} {...a11yOf('recommendations', error)} className={INPUT_CLASS} />
      </FieldRow>
    </fieldset>
  );
}

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
 * The completion form (FR-011…FR-014): summary and diagnoses, observations, ordered services, drugs, recommendations,
 * one atomic submit (API 7.3). Client rules mirror the server's; what only the server knows (a code outside the terminology
 * seed, a replay) comes back as problem+json and is shown on the field or as the read-only view.
 */
export function EncounterCompleteForm({ encounterId }: { readonly encounterId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const { methods, complete, onSubmit, foreignMessages, isMarked } = useEncounterForm(encounterId);

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} onKeyDown={blockImplicitSubmit} aria-label={t('formLabel')} noValidate>
        <DiagnosesEditor />
        <ObservationsEditor />
        <ServiceRequestsEditor />
        <MedicationsEditor />
        <RecommendationsSection />
        {complete.isError && isApiError(complete.error) ? <CompletionFailure problem={complete.error.problem} foreignMessages={foreignMessages} isMarked={isMarked} /> : null}
        <button type="submit" aria-disabled={complete.isPending} aria-busy={complete.isPending} className="mt-4 min-h-[44px] rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] aria-disabled:opacity-60">
          {complete.isPending ? t('completing') : t('complete')}
        </button>
      </form>
    </FormProvider>
  );
}
