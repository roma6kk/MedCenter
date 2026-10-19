'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { AdminPageHeader } from '../shared/admin-page-header';
import { formatDateKey } from '../shared/admin-dates';
import { currentYearRange, type ReportRange } from '../shared/report-range';
import { AnalyticsFilters } from './analytics-filters';
import { DEFAULT_TOP } from './analytics-types';
import { AppointmentsKpis } from './appointments-kpis';
import { GroupTable } from './group-table';
import { ReportSection } from './report-section';
import { useAppointmentsReport, useEncountersReport, useServicesPopularity } from './use-analytics';

interface Scope {
  readonly range: ReportRange;
  readonly top: number;
}

function Reports({ range, top }: Scope): ReactNode {
  const t = useT('admin.analytics');
  const appointments = useAppointmentsReport(range);
  const encounters = useEncountersReport(range);
  const services = useServicesPopularity(range, top);
  return (
    <div className="grid grid-cols-1 gap-4">
      <ReportSection title={t('appointments.title')} query={appointments} emptyTitle={t('empty')}>
        {(report) => <AppointmentsKpis report={report} />}
      </ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title={t('encounters.title')} query={encounters} emptyTitle={t('empty')}>
          {(report) => <GroupTable report={report} caption={t('encounters.title')} nameHeader={t('encounters.specialty')} countHeader={t('encounters.count')} unknownLabel={t('encounters.unknown')} />}
        </ReportSection>
        <ReportSection title={t('services.title', { top })} query={services} emptyTitle={t('empty')}>
          {(report) => <GroupTable report={report} caption={t('services.title', { top })} nameHeader={t('services.service')} countHeader={t('services.count')} unknownLabel={t('services.unknown')} showCodes={false} />}
        </ReportSection>
      </div>
    </div>
  );
}

/** `/admin/analytics` (FR-019): the period filter and the three reports 9.1–9.3 of the analytics service. */
export function AnalyticsPanel(): ReactNode {
  const t = useT('admin.analytics');
  const [scope, setScope] = useState<Scope>(() => ({ range: currentYearRange(), top: DEFAULT_TOP }));
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <AnalyticsFilters range={scope.range} top={scope.top} onApply={(range, top) => setScope({ range, top })} />
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('period', { from: formatDateKey(scope.range.from), to: formatDateKey(scope.range.to) })}</p>
      <Reports range={scope.range} top={scope.top} />
    </>
  );
}
