'use client';

import type { ReactNode } from 'react';
import { useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import { SERVICE_REQUESTS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CodedTermField } from './coded-term-field';
import { SERVICES_VALUE_SET } from './doctor-api';
import { EMPTY_SERVICE } from './encounter-form-defaults';
import { a11yOf, ADD_BUTTON_CLASS, errorAt, FIELDSET_CLASS, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { FieldRow, RemoveRowButton } from './encounter-form-fields';

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
  return (
    <fieldset className={`mt-4 ${FIELDSET_CLASS}`}>
      <legend className="px-1 font-semibold">{t('legend')}</legend>
      {fields.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('empty')}</p> : null}
      {fields.map((field, index) => <ServiceRow key={field.id} index={index} onRemove={() => remove(index)} />)}
      <button type="button" onClick={() => append(EMPTY_SERVICE, { focusName: `serviceRequests.${fields.length}.code` })} disabled={fields.length >= SERVICE_REQUESTS_MAX} className={ADD_BUTTON_CLASS}>
        {t('add')}
      </button>
    </fieldset>
  );
}
