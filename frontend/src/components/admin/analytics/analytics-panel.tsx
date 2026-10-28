'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMinskToday } from '@/components/doctor/use-minsk-today';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { QueryState } from '../shared/query-state';
import type { ReportRange } from '../shared/report-range';
import { AnalyticsFilters } from './analytics-filters';
import { defaultScope, presetRange, previousRange, scopeFromParams, scopeToQuery, withToday, type AnalyticsScope, type PeriodPreset } from './analytics-period';
import { bucketsOf } from './analytics-series';
import { AppointmentsChart } from './appointments-chart';
import { AppointmentsKpis } from './appointments-kpis';
import { GroupBars } from './group-bars';
import { GroupTable } from './group-table';
import { InsightCards } from './insight-cards';
import { periodDays, periodTitle } from './period-title';
import { ReportSection } from './report-section';
import { useAppointmentSeries, useAppointmentsReport, useEncountersReport, useServicesPopularity } from './use-analytics';

const ANALYTICS_PATH = '/admin/analytics';

/** Mirrors the scope into the address bar without a navigation (Next syncs `useSearchParams` with `replaceState`). */
function writeScopeToUrl(scope: AnalyticsScope): void {
  const query: string = scopeToQuery(scope);
  window.history.replaceState(null, '', query === '' ? ANALYTICS_PATH : `${ANALYTICS_PATH}?${query}`);
}

interface ScopeState {
  readonly scope: AnalyticsScope;
  readonly choosePreset: (preset: PeriodPreset) => void;
  readonly chooseRange: (range: ReportRange) => void;
  readonly chooseTop: (top: number) => void;
}

/**
 * The period and the top size, followed in both directions: a choice on screen is written to the address (so a link or a
 * reload keeps it), and a navigation that changes the address (back/forward, the sidebar link) moves the screen. A preset
 * follows the clock, so a page left open overnight moves on to the new day.
 */
function useAnalyticsScope(): ScopeState {
  const today: string = useMinskToday();
  const params: URLSearchParams = useSearchParams();
  const urlQuery: string = params.toString();
  const [chosen, setChosen] = useState<AnalyticsScope>(() => scopeFromParams(params, today));
  const [seenQuery, setSeenQuery] = useState<string>(urlQuery);
  if (seenQuery !== urlQuery) {
    setSeenQuery(urlQuery);
    setChosen(scopeFromParams(params, today));
  }
  const apply = (next: AnalyticsScope): void => {
    setChosen(next);
    writeScopeToUrl(next);
  };
  const scope: AnalyticsScope = withToday(chosen, today);
  return {
    scope,
    choosePreset: (preset) => apply(preset === 'custom' ? { ...scope, preset, range: scope.range } : { ...scope, preset, range: presetRange(preset, today) }),
    chooseRange: (range) => apply({ ...scope, preset: 'custom', range }),
    chooseTop: (top) => apply({ ...scope, top }),
  };
}

/** `/admin/analytics` (FR-019): the period and the reports 9.1–9.3 of the analytics service, as tiles, a chart over time, bars and a ranking. */
export function AnalyticsPanel(): ReactNode {
  const t = useT('admin.analytics');
  const locale = useUiStore((state) => state.locale);
  useDocumentTitle(t('title'));
  const { scope, choosePreset, chooseRange, chooseTop } = useAnalyticsScope();
  const { preset, range, top } = scope;
  const appointments = useAppointmentsReport(range);
  const previous = useAppointmentsReport(previousRange(preset, range));
  const encounters = useEncountersReport(range);
  const services = useServicesPopularity(range, top);
  const buckets = useMemo(() => bucketsOf({ from: range.from, to: range.to }), [range.from, range.to]);
  // Nothing to chart while the totals say there is nothing: the empty state above already says so.
  const series = useAppointmentSeries(buckets, appointments.data === undefined || appointments.data.total > 0);
  const appointmentsHeading: string = useId();
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary-soft-foreground">{periodDays(scope, t, locale)}</p>
          <h1 className="mt-1.5 max-w-[720px] text-3xl font-bold leading-[1.15] tracking-tight">{periodTitle(scope, t, locale)}</h1>
        </div>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>
          {t('print')}
        </Button>
      </header>
      <AnalyticsFilters preset={preset} range={range} top={top} onPreset={choosePreset} onRange={chooseRange} onTop={chooseTop} />
      <div className="grid grid-cols-1 gap-6">
        <section aria-labelledby={appointmentsHeading} className="grid gap-3">
          <h2 id={appointmentsHeading} className="text-lg font-bold">{t('appointments.title')}</h2>
          <QueryState query={appointments} isEmpty={(report) => report.total === 0} emptyTitle={t('empty')}>
            {(report) => <AppointmentsKpis report={report} previous={previous.data} previousPending={previous.isPending} preset={preset} />}
          </QueryState>
        </section>
        {appointments.data !== undefined && appointments.data.total === 0 ? null : <AppointmentsChart series={series} columns={buckets.length} />}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <ReportSection title={t('encounters.title')} query={encounters} emptyTitle={t('empty')}>
            {(report) => <GroupBars report={report} caption={t('encounters.title')} />}
          </ReportSection>
          <ReportSection title={t('services.title', { top })} query={services} emptyTitle={t('empty')}>
            {(report) => <GroupTable report={report} caption={t('services.title', { top })} nameHeader={t('services.service')} countHeader={t('services.count')} kind="services" />}
          </ReportSection>
        </div>
        <InsightCards appointments={appointments.data} encounters={encounters.data} />
      </div>
    </>
  );
}
