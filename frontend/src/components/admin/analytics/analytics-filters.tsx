'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { useT } from '@/lib/i18n/use-t';
import { controlProps, Field } from '../shared/form-field';
import { validateReportRange, type ReportRange } from '../shared/report-range';
import { PERIOD_PRESETS, type PeriodPreset } from './analytics-period';
import { TOP_OPTIONS } from './analytics-types';

interface AnalyticsFiltersProps {
  readonly preset: PeriodPreset;
  readonly range: ReportRange;
  readonly top: number;
  readonly onPreset: (preset: PeriodPreset) => void;
  readonly onRange: (range: ReportRange) => void;
  readonly onTop: (top: number) => void;
}

/**
 * The two dates of a custom period. They are kept as typed and only a valid, ordered period of at most 366 days is passed
 * on, so a half-typed date never reaches the API (it would answer 400) and no «Показать» button is needed.
 */
function CustomRange({ initial, onRange }: { readonly initial: ReportRange; readonly onRange: (range: ReportRange) => void }): ReactNode {
  const t = useT('admin.analytics');
  const [draft, setDraft] = useState<ReportRange>(initial);
  const reason = validateReportRange(draft);
  const error: string | undefined = reason === null ? undefined : t(`errors.${reason}`);
  const change = (next: ReportRange): void => {
    setDraft(next);
    if (validateReportRange(next) === null) onRange(next);
  };
  return (
    <>
      <Field id="analytics-from" label={t('filters.from')} error={error}>
        <DatePicker {...controlProps('analytics-from', error)} value={draft.from} onChange={(from) => change({ ...draft, from })} wrapperClassName="w-44" />
      </Field>
      <Field id="analytics-to" label={t('filters.to')}>
        <DatePicker id="analytics-to" value={draft.to} aria-invalid={error ? true : undefined} aria-describedby={error ? 'analytics-from-error' : undefined} onChange={(to) => change({ ...draft, to })} wrapperClassName="w-44" />
      </Field>
    </>
  );
}

/** Quick periods as one segmented control, a custom period behind «Свой период», and the length of the «top services» list. Every change applies at once. */
export function AnalyticsFilters({ preset, range, top, onPreset, onRange, onTop }: AnalyticsFiltersProps): ReactNode {
  const t = useT('admin.analytics');
  return (
    <div role="group" aria-label={t('filters.label')} className="no-print mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
      <SegmentedControl<PeriodPreset>
        kind="toggle"
        label={t('filters.period')}
        className="self-end"
        value={preset}
        onChange={onPreset}
        options={PERIOD_PRESETS.map((value) => ({ value, label: t(`filters.presets.${value}`) }))}
      />
      {preset === 'custom' ? <CustomRange initial={range} onRange={onRange} /> : null}
      <div className="grid gap-1.5 sm:ml-auto">
        <label htmlFor="analytics-top" className="form-label">{t('filters.top')}</label>
        <Select id="analytics-top" value={top} onChange={(event) => onTop(Number(event.target.value))} wrapperClassName="w-24">
          {TOP_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
