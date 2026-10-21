'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { formatDateKey } from '@/lib/clinic-time';
import { currentYearRange, type ReportRange } from '../shared/report-range';
import { AnalyticsFilters } from './analytics-filters';
import { headlineOf } from './analytics-insights';
import { DEFAULT_TOP } from './analytics-types';
import { AppointmentsKpis } from './appointments-kpis';
import { CheckList } from './check-list';
import { GroupTable } from './group-table';
import { InsightCards } from './insight-cards';
import { ReportSection } from './report-section';
import { useAppointmentsReport, useEncountersReport, useServicesPopularity } from './use-analytics';

interface Scope {
  readonly range: ReportRange;
  readonly top: number;
}

/** `/admin/analytics` (FR-019): the period filter and the three reports 9.1–9.3 of the analytics service, read as a report with conclusions. */
export function AnalyticsPanel(): ReactNode {
  const t = useT('admin.analytics');
  useDocumentTitle(t('title'));
  const [scope, setScope] = useState<Scope>(() => ({ range: currentYearRange(), top: DEFAULT_TOP }));
  const { range, top } = scope;
  const appointments = useAppointmentsReport(range);
  const encounters = useEncountersReport(range);
  const services = useServicesPopularity(range, top);
  const headline = appointments.data === undefined ? 'none' : headlineOf(appointments.data);
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.06em] text-primary-soft-foreground">
            {t('period', { from: formatDateKey(range.from, 'numeric'), to: formatDateKey(range.to, 'numeric') })}
          </p>
          <h1 className="mt-1.5 max-w-[720px] text-[28px] font-bold leading-[1.15] tracking-tight md:text-[34px]">{headline === 'none' ? t('title') : t(`headline.${headline}`)}</h1>
          {headline === 'none' ? <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{t('description')}</p> : null}
        </div>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>
          {t('print')}
        </Button>
      </header>
      <AnalyticsFilters range={range} top={top} onApply={(nextRange, nextTop) => setScope({ range: nextRange, top: nextTop })} />
      <div className="grid grid-cols-1 gap-4">
        <InsightCards appointments={appointments.data} encounters={encounters.data} />
        <ReportSection title={t('appointments.title')} query={appointments} emptyTitle={t('empty')}>
          {(report) => <AppointmentsKpis report={report} />}
        </ReportSection>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <ReportSection title={t('encounters.title')} query={encounters} emptyTitle={t('empty')}>
            {(report) => <GroupTable report={report} caption={t('encounters.title')} nameHeader={t('encounters.specialty')} countHeader={t('encounters.count')} kind="encounters" />}
          </ReportSection>
          <ReportSection title={t('services.title', { top })} query={services} emptyTitle={t('empty')}>
            {(report) => <GroupTable report={report} caption={t('services.title', { top })} nameHeader={t('services.service')} countHeader={t('services.count')} kind="services" />}
          </ReportSection>
        </div>
        <CheckList appointments={appointments.data} encounters={encounters.data} services={services.data} />
      </div>
    </>
  );
}
