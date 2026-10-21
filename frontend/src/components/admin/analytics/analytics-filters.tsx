'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS, PRIMARY_BUTTON_CLASS } from '../shared/admin-styles';
import { focusField } from '../shared/focus-field';
import { controlProps, Field } from '../shared/form-field';
import { validateReportRange, type ReportRange, type ReportRangeError } from '../shared/report-range';
import { TOP_OPTIONS } from './analytics-types';

interface AnalyticsFiltersProps {
  readonly range: ReportRange;
  readonly top: number;
  readonly onApply: (range: ReportRange, top: number) => void;
}

interface FilterDraft {
  readonly draft: ReportRange;
  readonly setDraft: (range: ReportRange) => void;
  readonly draftTop: number;
  readonly setDraftTop: (top: number) => void;
  readonly rangeError: ReportRangeError | null;
  readonly handleSubmit: (event: FormEvent) => void;
}

function useFilterDraft(range: ReportRange, top: number, onApply: (range: ReportRange, top: number) => void): FilterDraft {
  const [draft, setDraft] = useState<ReportRange>(range);
  const [draftTop, setDraftTop] = useState<number>(top);
  const [rangeError, setRangeError] = useState<ReportRangeError | null>(null);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const error = validateReportRange(draft);
    setRangeError(error);
    if (error === null) onApply(draft, draftTop);
    else focusField('analytics-from');
  };
  return { draft, setDraft, draftTop, setDraftTop, rangeError, handleSubmit };
}

/**
 * Period (≤ 366 days) and the length of the «top services» list. The reports are requested on submit only, so a half-typed
 * date never reaches the API (it would answer 400).
 */
export function AnalyticsFilters({ range, top, onApply }: AnalyticsFiltersProps): ReactNode {
  const t = useT('admin.analytics');
  const { draft, setDraft, draftTop, setDraftTop, rangeError, handleSubmit } = useFilterDraft(range, top, onApply);
  const error: string | undefined = rangeError === null ? undefined : t(`errors.${rangeError}`);
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={handleSubmit} noValidate className="no-print mb-6 flex flex-wrap items-end gap-3 rounded-card border border-[var(--border)] bg-[var(--card)] p-4">
      <Field id="analytics-from" label={t('filters.from')} error={error}>
        <input {...controlProps('analytics-from', error)} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={CONTROL_CLASS} />
      </Field>
      <Field id="analytics-to" label={t('filters.to')}>
        <input id="analytics-to" type="date" value={draft.to} aria-invalid={error ? true : undefined} aria-describedby={error ? 'analytics-from-error' : undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={CONTROL_CLASS} />
      </Field>
      <Field id="analytics-top" label={t('filters.top')}>
        <select id="analytics-top" value={draftTop} onChange={(event) => setDraftTop(Number(event.target.value))} className={CONTROL_CLASS}>
          {TOP_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>
      <button type="submit" className={PRIMARY_BUTTON_CLASS}>{t('filters.apply')}</button>
    </form>
  );
}
