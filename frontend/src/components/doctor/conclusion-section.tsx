'use client';

import type { ReactNode } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { RECOMMENDATIONS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { FieldRow } from './encounter-form-fields';
import { FormSection } from './encounter-form-section';
import { a11yOf, errorAt, INPUT_CLASS } from './encounter-form-helpers';

export function ConclusionSection(): ReactNode {
  const t = useT('doctor.encounter');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: ['summary', 'recommendations'] });
  const summaryError = errorAt(errors, 'summary');
  const recommendationsError = errorAt(errors, 'recommendations');
  return (
    <FormSection id="conclusion" title={t('conclusionLegend')}>
      <div className="grid gap-4">
        <FieldRow id="summary" label={t('summary')} error={summaryError}>
          <textarea id="summary" rows={4} {...register('summary')} {...a11yOf('summary', summaryError)} className={INPUT_CLASS} />
        </FieldRow>
        <FieldRow id="recommendations" label={t('recommendations')} error={recommendationsError}>
          <textarea id="recommendations" rows={3} maxLength={RECOMMENDATIONS_MAX} {...register('recommendations')} {...a11yOf('recommendations', recommendationsError)} className={INPUT_CLASS} />
        </FieldRow>
      </div>
    </FormSection>
  );
}
