'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { focusField } from '../shared/focus-field';
import { controlProps, Field } from '../shared/form-field';
import { defaultAuditFilter, hasAuditFilterErrors, validateAuditFilter, type AuditFilter, type AuditFilterErrors } from './audit-filter';
import { ENTITY_SUGGESTIONS } from './audit-types';

interface AuditFiltersFormProps {
  readonly filter: AuditFilter;
  readonly onApply: (filter: AuditFilter) => void;
}

const INVALID_FIELD_IDS: ReadonlyArray<readonly [keyof AuditFilterErrors, string]> = [
  ['range', 'audit-from'],
  ['entity', 'audit-entity'],
  ['userId', 'audit-user'],
];

function focusFirstInvalid(errors: AuditFilterErrors): void {
  const invalid = INVALID_FIELD_IDS.find(([key]) => errors[key] !== undefined);
  if (invalid !== undefined) focusField(invalid[1]);
}

interface FilterDraft {
  readonly draft: AuditFilter;
  readonly setDraft: (filter: AuditFilter) => void;
  readonly errors: AuditFilterErrors;
  readonly handleSubmit: (event: FormEvent) => void;
  readonly handleReset: () => void;
}

function useFilterDraft(filter: AuditFilter, onApply: (filter: AuditFilter) => void): FilterDraft {
  const [draft, setDraft] = useState<AuditFilter>(filter);
  const [errors, setErrors] = useState<AuditFilterErrors>({});
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const found = validateAuditFilter(draft);
    setErrors(found);
    if (hasAuditFilterErrors(found)) focusFirstInvalid(found);
    else onApply(draft);
  };
  const handleReset = (): void => {
    const initial = defaultAuditFilter();
    setDraft(initial);
    setErrors({});
    onApply(initial);
  };
  return { draft, setDraft, errors, handleSubmit, handleReset };
}

/** Period, resource and user filters of the journal. Applied on submit (Enter or «Применить»), never per keystroke. */
export function AuditFiltersForm({ filter, onApply }: AuditFiltersFormProps): ReactNode {
  const t = useT('admin.audit');
  const { draft, setDraft, errors, handleSubmit, handleReset } = useFilterDraft(filter, onApply);
  const rangeError: string | undefined = errors.range === undefined ? undefined : t(`errors.${errors.range}`);
  const entityError: string | undefined = errors.entity === true ? t('errors.entity') : undefined;
  const userError: string | undefined = errors.userId === true ? t('errors.userId') : undefined;
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={handleSubmit} noValidate className="mb-4 flex flex-wrap items-end gap-3">
      <Field id="audit-from" label={t('filters.from')} error={rangeError}>
        <input {...controlProps('audit-from', rangeError)} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={CONTROL_CLASS} />
      </Field>
      <Field id="audit-to" label={t('filters.to')}>
        <input id="audit-to" type="date" value={draft.to} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? 'audit-from-error' : undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={CONTROL_CLASS} />
      </Field>
      <Field id="audit-entity" label={t('filters.entity')} error={entityError} hint={t('filters.entityHint')}>
        <input {...controlProps('audit-entity', entityError, t('filters.entityHint'))} list="audit-entity-options" value={draft.entity} maxLength={130} autoComplete="off" onChange={(event) => setDraft({ ...draft, entity: event.target.value })} className={`${CONTROL_CLASS} mono`} />
        <datalist id="audit-entity-options">
          {ENTITY_SUGGESTIONS.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
      </Field>
      <Field id="audit-user" label={t('filters.userId')} error={userError}>
        <input {...controlProps('audit-user', userError)} value={draft.userId} maxLength={128} autoComplete="off" onChange={(event) => setDraft({ ...draft, userId: event.target.value })} className={`${CONTROL_CLASS} mono`} />
      </Field>
      <button type="submit" className={PRIMARY_BUTTON_CLASS}>{t('filters.apply')}</button>
      <button type="button" onClick={handleReset} className={SECONDARY_BUTTON_CLASS}>{t('filters.reset')}</button>
    </form>
  );
}
