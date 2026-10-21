'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pager } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { PrintButton } from './print-button';
import type { DiagnosisView, HistoryEntry } from './patient-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useClampedPage } from './use-clamped-page';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useMyHistory } from './use-patient-queries';
import { WRAP_TEXT } from './wrap-text';

export const HISTORY_PAGE_SIZE = 10;
export const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

/** The diagnoses of a visit; an old record that has only the primary code still shows it. */
function diagnosesOf(entry: HistoryEntry): ReadonlyArray<DiagnosisView> {
  if (entry.diagnoses.length > 0) return entry.diagnoses;
  return entry.diagnosis === '' ? [] : [{ code: entry.diagnosis, display: '' }];
}

function Diagnosis({ diagnosis }: { readonly diagnosis: DiagnosisView }): ReactNode {
  const t = useT('patient.history');
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-2 text-sm">
      <CodeChip code={diagnosis.code} system={ICD10_SYSTEM} />
      {diagnosis.display ? <span className={WRAP_TEXT}>{diagnosis.display}</span> : null}
      {diagnosis.verificationStatus ? <span className="text-xs text-[var(--muted-foreground)]">({t(`verification.${diagnosis.verificationStatus}`)})</span> : null}
    </li>
  );
}

function Diagnoses({ entry }: { readonly entry: HistoryEntry }): ReactNode {
  const t = useT('patient.history');
  const diagnoses = diagnosesOf(entry);
  if (diagnoses.length === 0) return <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('noDiagnosis')}</p>;
  return (
    <div className="mt-2">
      <p className="form-label">{t('diagnoses')}</p>
      <ul className="mt-1 grid gap-1">{diagnoses.map((diagnosis) => <Diagnosis key={diagnosis.code} diagnosis={diagnosis} />)}</ul>
    </div>
  );
}

function VisitText({ label, text }: { readonly label: string; readonly text: string }): ReactNode {
  return (
    <p className={`mt-2 text-sm ${WRAP_TEXT}`}>
      <span className="form-label mr-2">{label}</span>
      <span className={`whitespace-pre-line ${WRAP_TEXT}`}>{text}</span>
    </p>
  );
}

function VisitEntry({ entry }: { readonly entry: HistoryEntry }): ReactNode {
  const t = useT('patient.history');
  const format = useClinicFormat();
  const titleId = `visit-${entry.id}`;
  return (
    <li className="relative min-w-0">
      <span aria-hidden="true" className="absolute -left-[21px] top-2 h-2 w-2 rounded-full bg-[var(--primary)]" />
      <article aria-labelledby={titleId} className="min-w-0 rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <time id={titleId} dateTime={entry.date} className="serif text-[20px] font-semibold">{format.dateTime(entry.date)}</time>
          {entry.serviceType?.display ? <p className={`text-sm text-[var(--muted-foreground)] ${WRAP_TEXT}`}>{entry.serviceType.display}</p> : null}
        </div>
        <Diagnoses entry={entry} />
        {entry.summary ? <VisitText label={t('summary')} text={entry.summary} /> : null}
        {entry.recommendations ? <VisitText label={t('recommendations')} text={entry.recommendations} /> : null}
        <p className="no-print mt-3 text-sm">
          <Link href={`/appointments/${encodeURIComponent(entry.appointmentId)}`} className="inline-flex min-h-[44px] items-center underline">{t('openAppointment')}</Link>
        </p>
      </article>
    </li>
  );
}

interface TimelineProps {
  readonly query: ReturnType<typeof useMyHistory>;
  readonly onPage: (page: number) => void;
}

function Timeline({ query, onPage }: TimelineProps): ReactNode {
  const t = useT('patient.history');
  if (query.data === undefined) return <QueryFailure query={query} embedded pending={<TableSkeleton />} />;
  if (query.data.items.length === 0) return <EmptyState title={t('empty')} description={t('emptyHint')} />;
  return (
    <>
      <ol aria-label={t('listLabel')} className="grid grid-cols-1 gap-3 border-l border-[var(--border)] pl-4">
        {query.data.items.map((entry) => <VisitEntry key={entry.id} entry={entry} />)}
      </ol>
      {query.data.meta.totalPages > 1 ? <Pager meta={query.data.meta} onPage={onPage} /> : null}
    </>
  );
}

/** The patient's finished visits (FR-006, API 7.6): newest first, a diagnosis chip and the doctor's words for each. */
export function HistoryTimeline(): ReactNode {
  const t = useT('patient.history');
  const [page, setPage] = useState(1);
  const query = useMyHistory({ page, pageSize: HISTORY_PAGE_SIZE });
  useClampedPage(query.data?.meta, page, setPage);
  useDocumentTitle(t('title'));
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="serif text-2xl font-bold">{t('title')}</h1>
        {query.data !== undefined && query.data.items.length > 0 ? <PrintButton label={t('print')} /> : null}
      </div>
      <div className="mt-4" aria-busy={query.isFetching}><Timeline query={query} onPage={setPage} /></div>
    </section>
  );
}
