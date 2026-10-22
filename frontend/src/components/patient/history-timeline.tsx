'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { DiagnosisPanel, RepeatVisitCard } from './history/diagnosis-panel';
import { diagnosisFrequency, filterByDiagnosis, groupByMonth, prescriptionsByEncounter, summarize } from './history/history-model';
import { SummaryTiles } from './history/summary-tiles';
import { VisitRow } from './history/visit-row';
import type { HistoryEntry, Prescription } from './patient-types';
import { PrintButton } from './print-button';
import { useClampedPage } from './use-clamped-page';
import { useMyHistory, useMyPrescriptions } from './use-patient-queries';
import type { PageMeta } from '@/lib/api/pagination';

export { ICD10_SYSTEM } from './history/visit-row';
export const HISTORY_PAGE_SIZE = 10;
const PRESCRIPTIONS_LOOKUP_SIZE = 100;
const EMPTY_PRESCRIPTIONS: ReadonlyArray<Prescription> = [];

function DiagnosisFilter({ codes, value, onChange }: { readonly codes: ReadonlyArray<string>; readonly value: string | null; readonly onChange: (code: string | null) => void }): ReactNode {
  const t = useT('patientHistory');
  const item = (selected: boolean): string =>
    cn('min-h-[38px] rounded-[9px] px-3.5 text-sm', selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground');
  return (
    <div role="group" aria-label={t('filterLabel')} className="no-print inline-flex flex-wrap gap-0.5 rounded-control bg-secondary p-[3px]">
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={item(value === null)}>{t('filterAll')}</button>
      {codes.map((code) => (
        <button key={code} type="button" aria-pressed={value === code} onClick={() => onChange(code)} className={cn(item(value === code), 'mono')}>{code}</button>
      ))}
    </div>
  );
}

function MonthHeading({ monthKey, id }: { readonly monthKey: string; readonly id: string }): ReactNode {
  const { locale } = useClinicFormat();
  const [year = 0, month = 1] = monthKey.split('-').map(Number);
  const name = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return <h2 id={id} className="text-xl font-bold">{`${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`}</h2>;
}

interface LoadedProps {
  readonly items: ReadonlyArray<HistoryEntry>;
  readonly meta: PageMeta;
  readonly prescriptions: ReadonlyArray<Prescription>;
  readonly onPage: (page: number) => void;
}

function Loaded({ items, meta, prescriptions, onPage }: LoadedProps): ReactNode {
  const t = useT('patientHistory');
  const [chosen, setChosen] = useState<string | null>(null);
  const summary = useMemo(() => summarize(items), [items]);
  const frequency = useMemo(() => diagnosisFrequency(items), [items]);
  const byEncounter = useMemo(() => prescriptionsByEncounter(prescriptions), [prescriptions]);
  const filter = frequency.some((item) => item.code === chosen) ? chosen : null;
  const groups = useMemo(() => groupByMonth(filterByDiagnosis(items, filter)), [items, filter]);
  return (
    <>
      <SummaryTiles summary={summary} meta={meta} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
          {frequency.length > 1 ? <DiagnosisFilter codes={frequency.map((item) => item.code)} value={filter} onChange={setChosen} /> : null}
          {groups.length === 0 ? <EmptyState title={t('emptyFiltered')} /> : null}
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`hx-month-${group.key}`} className="flex flex-col gap-3">
              <MonthHeading monthKey={group.key} id={`hx-month-${group.key}`} />
              <ol aria-labelledby={`hx-month-${group.key}`} className="flex flex-col gap-3">
                {group.entries.map((entry) => <VisitRow key={entry.id} entry={entry} prescriptions={byEncounter.get(entry.id) ?? EMPTY_PRESCRIPTIONS} />)}
              </ol>
            </section>
          ))}
          {meta.totalPages > 1 ? <Pager meta={meta} onPage={onPage} /> : null}
        </div>
        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <DiagnosisPanel frequency={frequency} />
          <RepeatVisitCard />
        </aside>
      </div>
    </>
  );
}

/** The patient's finished visits (FR-006, API 7.6): newest first, by month, each row opens to the doctor's words and the prescriptions of that visit. */
export function HistoryTimeline(): ReactNode {
  const t = useT('patientHistory');
  const [page, setPage] = useState(1);
  const query = useMyHistory({ page, pageSize: HISTORY_PAGE_SIZE });
  const prescriptions = useMyPrescriptions({ page: 1, pageSize: PRESCRIPTIONS_LOOKUP_SIZE });
  useClampedPage(query.data?.meta, page, setPage);
  useDocumentTitle(t('title'));
  const data = query.data;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">{t('title')}</h1>
          <p className="mt-1.5 text-base text-muted-foreground">{t('subtitle')}</p>
        </div>
        {data !== undefined && data.items.length > 0 ? <PrintButton label={t('print')} /> : null}
      </div>
      <div aria-busy={query.isFetching} className="flex flex-col gap-6">
        {data === undefined ? <QueryFailure query={query} embedded pending={<TableSkeleton />} /> : null}
        {data !== undefined && data.items.length === 0 ? <EmptyState title={t('empty')} description={t('emptyHint')} /> : null}
        {data !== undefined && data.items.length > 0 ? <Loaded items={data.items} meta={data.meta} prescriptions={prescriptions.data?.items ?? EMPTY_PRESCRIPTIONS} onPage={setPage} /> : null}
      </div>
    </section>
  );
}
