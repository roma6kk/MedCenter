'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pager } from '@/components/data-display/paginated-table';
import { SectionTitle } from '@/components/feedback/section-title';
import { TableSkeleton } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { DiagnosisList } from './diagnosis-list';
import type { HistoryItem } from './doctor-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { usePatientHistory } from './use-doctor-queries';

function VisitText({ label, text }: { readonly label: string; readonly text: string }): ReactNode {
  return (
    <p className="mt-2 text-sm">
      <span className="form-label mr-2">{label}</span>
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}

function VisitEntry({ item }: { readonly item: HistoryItem }): ReactNode {
  const t = useT('doctor.history');
  return (
    <li className="relative">
      <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
      <article className="rounded-card border border-border bg-card p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="mono text-sm">{formatClinicDateTime(item.date)}</p>
          {item.serviceType?.display ? <p className="text-sm text-muted-foreground">{item.serviceType.display}</p> : null}
        </div>
        <div className="mt-2">{item.diagnoses.length > 0 ? <DiagnosisList diagnoses={item.diagnoses} /> : <p className="text-sm text-muted-foreground">{t('noDiagnoses')}</p>}</div>
        {item.summary ? <VisitText label={t('summary')} text={item.summary} /> : null}
        {item.recommendations ? <VisitText label={t('recommendations')} text={item.recommendations} /> : null}
        <p className="mt-3 text-sm">
          <Link href={`/encounters/${encodeURIComponent(item.id)}`} aria-label={t('openEncounterOn', { date: formatClinicDateTime(item.date) })} className="underline">{t('openEncounter')}</Link>
        </p>
      </article>
    </li>
  );
}

/** The patient's finished visits (API 7.4), newest first as the service returns them; each one opens its read-only record. */
export function PatientHistoryTimeline({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.history');
  const [page, setPage] = useState(1);
  const history = usePatientHistory(patientId, page);
  return (
    <section aria-labelledby="history-title" className="mt-6">
      <div id="history-title"><SectionTitle>{t('title')}</SectionTitle></div>
      <div className="mt-3" aria-busy={history.isFetching}>
        {history.data === undefined ? <QueryFailure query={history} embedded notFoundText={t('unavailable')} pending={<TableSkeleton />} /> : null}
        {history.data && history.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        {history.data && history.data.items.length > 0 ? (
          <>
            <ol className="grid gap-3 border-l border-border pl-4">{history.data.items.map((item) => <VisitEntry key={item.id} item={item} />)}</ol>
            {history.data.meta.totalPages > 1 ? <Pager meta={history.data.meta} onPage={setPage} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
