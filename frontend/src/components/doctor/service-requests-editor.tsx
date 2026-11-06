'use client';

import type { ReactNode } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { SERVICE_REQUESTS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CodedTermField } from './coded-term-field';
import { SERVICES_VALUE_SET } from './doctor-api';
import { EMPTY_SERVICE } from './encounter-form-defaults';
import { ROW_CLASS } from './encounter-form-helpers';
import { AddRowButton, EmptyListLine, RemoveRowButton, TextRowField } from './encounter-form-fields';
import { FormSection } from './encounter-form-section';
import { useRemoveRowFocus } from './use-remove-row-focus';

function ServiceRow({ index, onRemove }: { readonly index: number; readonly onRemove: () => void }): ReactNode {
  const t = useT('doctor.services');
  return (
    <div className={ROW_CLASS}>
      <CodedTermField list="serviceRequests" index={index} id={`service-code-${index}`} label={t('code', { n: index + 1 })} placeholder={t('codePlaceholder')} valueSet={SERVICES_VALUE_SET} />
      <TextRowField name={`serviceRequests.${index}.note`} id={`service-note-${index}`} label={t('note', { n: index + 1 })} />
      <RemoveRowButton onClick={onRemove} label={t('remove')} ariaLabel={t('removeN', { n: index + 1 })} />
    </div>
  );
}

export function ServiceRequestsEditor(): ReactNode {
  const t = useT('doctor.services');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'serviceRequests' });
  const removeRow = useRemoveRowFocus('serviceRequests', 'code', 'services', fields.length, remove);
  const add = (): void => append(EMPTY_SERVICE, { focusName: `serviceRequests.${fields.length}.code` });
  return (
    <FormSection id="services" title={t('legend')}>
      {fields.length === 0 ? <EmptyListLine message={t('empty')} addLabel={t('add')} onAdd={add} /> : null}
      {fields.map((field, index) => <ServiceRow key={field.id} index={index} onRemove={() => removeRow(index)} />)}
      {fields.length > 0 ? <AddRowButton label={t('add')} onClick={add} disabled={fields.length >= SERVICE_REQUESTS_MAX} /> : null}
    </FormSection>
  );
}
