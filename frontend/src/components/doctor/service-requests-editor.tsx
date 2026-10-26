'use client';

import type { ReactNode } from 'react';
import { useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import { SERVICE_REQUESTS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CodedTermField } from './coded-term-field';
import { SERVICES_VALUE_SET } from './doctor-api';
import { EMPTY_SERVICE } from './encounter-form-defaults';
import { a11yOf, errorAt, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { AddRowButton, EmptyListLine, FieldRow, RemoveRowButton } from './encounter-form-fields';
import { FormSection } from './encounter-form-section';

function ServiceRow({ index, onRemove }: { readonly index: number; readonly onRemove: () => void }): ReactNode {
  const t = useT('doctor.services');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `serviceRequests.${index}.note` });
  const noteId = `service-note-${index}`;
  const noteError = errorAt(errors, `serviceRequests.${index}.note`);

  return (
    <div className={ROW_CLASS}>
      <CodedTermField list="serviceRequests" index={index} id={`service-code-${index}`} label={t('code', { n: index + 1 })} placeholder={t('codePlaceholder')} valueSet={SERVICES_VALUE_SET} />
      <div className="mt-2">
        <FieldRow id={noteId} label={t('note', { n: index + 1 })} error={noteError}>
          <input id={noteId} {...register(`serviceRequests.${index}.note`)} {...a11yOf(noteId, noteError)} className={INPUT_CLASS} autoComplete="off" />
        </FieldRow>
      </div>
      <RemoveRowButton onClick={onRemove} label={t('remove')} ariaLabel={t('removeN', { n: index + 1 })} />
    </div>
  );
}

/** Ordered services / referrals (ServiceRequest, НСИ code; FR-014). Optional. */
export function ServiceRequestsEditor(): ReactNode {
  const t = useT('doctor.services');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'serviceRequests' });
  const add = (): void => append(EMPTY_SERVICE, { focusName: `serviceRequests.${fields.length}.code` });
  return (
    <FormSection id="services" title={t('legend')}>
      {fields.length === 0 ? <EmptyListLine message={t('empty')} addLabel={t('add')} onAdd={add} /> : null}
      {fields.map((field, index) => <ServiceRow key={field.id} index={index} onRemove={() => remove(index)} />)}
      {fields.length > 0 ? <AddRowButton label={t('add')} onClick={add} disabled={fields.length >= SERVICE_REQUESTS_MAX} /> : null}
    </FormSection>
  );
}
