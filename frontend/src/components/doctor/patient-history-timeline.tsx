'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Pager } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { SectionTitle } from '@/components/feedback/section-title';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { Card } from '@/components/ui/card';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { cn } from '@/lib/ui/cn';
import { DiagnosisList } from './diagnosis-list';
import type { HistoryItem, Prescription } from './doctor-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { isOwnVisit, useOwnRoleId } from './use-own-role';
import { usePatientHistory, usePatientPrescriptions } from './use-doctor-queries';

function VisitText({ label, text }: { readonly label: string; readonly text: string }): ReactNode {
  return (
    <p className="text-sm">
      <span className="form-label mr-2">{label}</span>
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}

/** What one order of the visit is called: the drug or the service, with the dosage for a drug. */
function orderText(item: Prescription): string {
  return item.kind === 'medication' ? `${item.atcDisplay ?? item.atcCode} — ${item.dosageText}` : item.display ?? item.code;
}

interface VisitEntryProps {
  readonly item: HistoryItem;
  readonly orders: ReadonlyArray<Prescription>;
  readonly isOpen: boolean;
  /** The visit was held by another doctor: its record is not open to this one. */
  readonly isColleague: boolean;
  readonly onToggle: () => void;
}

/**
 * A finished visit as a card that folds (A2): the date, the service and the diagnosis codes always show, the conclusion,
 * recommendations and orders of the visit appear when it is opened. The whole top row is the button, so the target is large.
 */
function VisitEntry({ item, orders, isOpen, isColleague, onToggle }: VisitEntryProps): ReactNode {
  const t = useT('doctor.history');
  const detailsId: string = useId();
  return (
    <li className="relative">
      <span aria-hidden="true" className="absolute -left-[21px] top-5 h-2 w-2 rounded-full bg-primary" />
      <Card as="article" radius="card" padding="none">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={detailsId}
          onClick={onToggle}
          className="flex min-h-[44px] w-full items-start gap-3 rounded-card p-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="tabular-nums font-semibold">{formatClinicDateTime(item.date)}</span>
              {item.serviceType?.display ? <span className="text-sm text-muted-foreground">{item.serviceType.display}</span> : null}
            </span>
            {item.doctorName ? <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{t('doctor', { name: item.doctorName })}</span> : null}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
              {item.diagnoses.length > 0 ? item.diagnoses.map((diagnosis, index) => <CodeChip key={`${diagnosis.code}-${index}`} code={diagnosis.code} />) : <span className="text-muted-foreground">{t('noDiagnoses')}</span>}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out', isOpen && 'rotate-180')} />
        </button>
        {isOpen ? (
          <div id={detailsId} className="grid gap-3 border-t border-border-soft p-4">
            {item.diagnoses.length > 0 ? <DiagnosisList diagnoses={item.diagnoses} /> : null}
            {item.summary ? <VisitText label={t('summary')} text={item.summary} /> : null}
            {item.recommendations ? <VisitText label={t('recommendations')} text={item.recommendations} /> : null}
            {orders.length > 0 ? (
              <div>
                <p className="form-label">{t('orders')}</p>
                <ul className="mt-1 grid gap-0.5 text-sm">{orders.map((order) => <li key={order.id}>{orderText(order)}</li>)}</ul>
              </div>
            ) : null}
            {isColleague ? (
              <p className="text-sm text-muted-foreground">{t('otherDoctor')}</p>
            ) : (
              <p className="text-sm">
                <Link href={`/encounters/${encodeURIComponent(item.id)}`} aria-label={t('openEncounterOn', { date: formatClinicDateTime(item.date) })} className="inline-flex min-h-[44px] items-center font-semibold text-primary-soft-foreground hover:underline">{t('openEncounter')}</Link>
              </p>
            )}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

/**
 * The patient's finished visits (API 7.4), newest first as the service returns them. Each one is a card that unfolds in place
 * (the newest starts open); its orders come from the same prescription page the summary reads. The full record of a visit
 * opens on its own page.
 */
export function PatientHistoryTimeline({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.history');
  const [page, setPage] = useState(1);
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  const history = usePatientHistory(patientId, page);
  const ownRoleId = useOwnRoleId();
  const prescriptions = usePatientPrescriptions(patientId, 1);
  const enter = useStaggerOnce(history.data !== undefined);
  const isOpen = (id: string, index: number): boolean => toggled[id] ?? (page === 1 && index === 0);
  return (
    <section aria-labelledby="history-title">
      <div id="history-title"><SectionTitle>{t('title')}</SectionTitle></div>
      <div className="mt-3" aria-busy={history.isFetching}>
        {history.data === undefined ? <QueryFailure query={history} embedded notFoundText={t('unavailable')} pending={<ContentSkeleton shape="timeline" rows={3} />} /> : null}
        {history.data && history.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        {history.data && history.data.items.length > 0 ? (
          <>
            <ol className={cn('grid gap-3 border-l border-border pl-4', enter)}>
              {history.data.items.map((item, index) => (
                <VisitEntry
                  key={item.id}
                  item={item}
                  orders={(prescriptions.data?.items ?? []).filter((order) => order.encounterId === item.id)}
                  isOpen={isOpen(item.id, index)}
                  isColleague={!isOwnVisit(item, ownRoleId)}
                  onToggle={() => setToggled((previous) => ({ ...previous, [item.id]: !isOpen(item.id, index) }))}
                />
              ))}
            </ol>
            {history.data.meta.totalPages > 1 ? <Pager meta={history.data.meta} onPage={setPage} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
