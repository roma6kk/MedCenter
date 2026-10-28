'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/ui/cn';
import { CONTROL_CLASS, SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { controlProps, Field } from '../shared/form-field';
import { useDebouncedCommit } from '../shared/use-debounced-commit';
import { defaultAuditFilter, hasAuditFilterErrors, validateAuditFilter, type AuditFilter, type AuditFilterErrors } from './audit-filter';
import { ENTITY_SUGGESTIONS } from './audit-types';

interface AuditFiltersFormProps {
  readonly filter: AuditFilter;
  readonly onApply: (filter: AuditFilter) => void;
}

interface FilterDraft {
  readonly draft: AuditFilter;
  readonly setDraft: (filter: AuditFilter) => void;
  readonly errors: AuditFilterErrors;
  readonly handleReset: () => void;
}

const sameFilter = (a: AuditFilter, b: AuditFilter): boolean => a.from === b.from && a.to === b.to && a.entity === b.entity && a.userId === b.userId;

/**
 * The draft follows what is typed; once it pauses it is checked, and a valid one is applied. A draft that does not pass
 * stays on screen with its error and is not sent (the API would answer 400), and the error is judged only after the pause, so
 * the first capital letter of «Appointment» is not called a mistake while it is still being typed.
 */
function useFilterDraft(filter: AuditFilter, onApply: (filter: AuditFilter) => void): FilterDraft {
  const [draft, setDraft] = useState<AuditFilter>(filter);
  const [errors, setErrors] = useState<AuditFilterErrors>({});
  useDebouncedCommit(
    draft,
    filter,
    (next) => {
      const found = validateAuditFilter(next);
      setErrors(found);
      if (!hasAuditFilterErrors(found)) onApply(next);
    },
    sameFilter,
  );
  const handleReset = (): void => {
    const initial = defaultAuditFilter();
    setDraft(initial);
    setErrors({});
    onApply(initial);
  };
  return { draft, setDraft, errors, handleReset };
}

/** Period, resource and user filters of the journal. They apply themselves (dates and text once the typing pauses); «Сбросить» returns to the last 30 days. */
export function AuditFiltersForm({ filter, onApply }: AuditFiltersFormProps): ReactNode {
  const t = useT('admin.audit');
  const { draft, setDraft, errors, handleReset } = useFilterDraft(filter, onApply);
  const rangeError: string | undefined = errors.range === undefined ? undefined : t(`errors.${errors.range}`);
  const entityError: string | undefined = errors.entity === true ? t('errors.entity') : undefined;
  const userError: string | undefined = errors.userId === true ? t('errors.userId') : undefined;
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={(event) => event.preventDefault()} noValidate className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-card border border-[var(--border)] bg-[var(--card)] p-4">
      <Field id="audit-from" label={t('filters.from')} error={rangeError}>
        <DatePicker {...controlProps('audit-from', rangeError)} value={draft.from} onChange={(from) => setDraft({ ...draft, from })} wrapperClassName="w-44" />
      </Field>
      <Field id="audit-to" label={t('filters.to')}>
        <DatePicker id="audit-to" value={draft.to} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? 'audit-from-error' : undefined} onChange={(to) => setDraft({ ...draft, to })} wrapperClassName="w-44" />
      </Field>
      <Field id="audit-entity" label={t('filters.entity')} error={entityError}>
        <input {...controlProps('audit-entity', entityError, t('filters.entityHint'))} list="audit-entity-options" value={draft.entity} maxLength={130} autoComplete="off" onChange={(event) => setDraft({ ...draft, entity: event.target.value })} className={cn(CONTROL_CLASS, 'mono w-52')} />
        <datalist id="audit-entity-options">
          {ENTITY_SUGGESTIONS.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
      </Field>
      <Field id="audit-user" label={t('filters.userId')} error={userError}>
        <input {...controlProps('audit-user', userError)} value={draft.userId} maxLength={128} autoComplete="off" onChange={(event) => setDraft({ ...draft, userId: event.target.value })} className={cn(CONTROL_CLASS, 'mono w-52')} />
      </Field>
      <button type="button" onClick={handleReset} className={SECONDARY_BUTTON_CLASS}>{t('filters.reset')}</button>
      {/* The hint of «Ресурс» sits under the whole row, not under its field: a taller field would lift its input above the others. */}
      <p id="audit-entity-hint" className="basis-full text-xs text-muted-foreground">{t('filters.entityHint')}</p>
    </form>
  );
}
