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
import { VisitPrintButton } from '@/components/print/visit-print-button';
import { DiagnosisList } from './diagnosis-list';
import { DoctorVisitPrint } from './doctor-visit-print';
import type { HistoryItem, Prescription } from './doctor-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { SkeletonText } from '@/components/ui/skeleton';
import { orderName } from './patient-summary-model';
import { isOwnVisit, useOwnRoleId } from './use-own-role';
import { usePatientHistory, useVisitPrescriptions } from './use-doctor-queries';

function VisitText({ label, text }: { readonly label: string; readonly text: string }): ReactNode {
  return (
    <p className="text-sm">
      <span className="form-label mr-2">{label}</span>
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}

function orderText(item: Prescription): string {
  return item.kind === 'medication' ? `${orderName(item)} — ${item.dosageText}` : orderName(item);
}

function VisitOrders({ patientId, encounterId }: { readonly patientId: string; readonly encounterId: string }): ReactNode {
  const t = useT('doctor.history');
  const tOrders = useT('doctor.prescriptions');
  const orders = useVisitPrescriptions(patientId, encounterId);
  if (orders.data === undefined) return <QueryFailure query={orders} embedded notFoundText={tOrders('unavailable')} pending={<SkeletonText lines={1} />} />;
  if (orders.data.items.length === 0) return null;
  return (
    <div>
      <p className="form-label">{t('orders')}</p>
      <ul className="mt-1 grid gap-0.5 text-sm">{orders.data.items.map((order) => <li key={order.id}>{orderText(order)}</li>)}</ul>
    </div>
  );
}

interface VisitEntryProps {
  readonly item: HistoryItem;
  readonly patientId: string;
  readonly isOpen: boolean;
  readonly isColleague: boolean;
  readonly onToggle: () => void;
}

function VisitEntry({ item, patientId, isOpen, isColleague, onToggle }: VisitEntryProps): ReactNode {
  const t = useT('doctor.history');
  const tPrint = useT('visitPrint');
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
            <VisitOrders patientId={patientId} encounterId={item.id} />
            <div>
              <VisitPrintButton label={tPrint('print')} ariaLabel={tPrint('printVisit', { date: formatClinicDateTime(item.date) })}>
                {(finish) => <DoctorVisitPrint item={item} patientId={patientId} onDone={finish} />}
              </VisitPrintButton>
            </div>
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

export function PatientHistoryTimeline({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.history');
  const [page, setPage] = useState(1);
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  const history = usePatientHistory(patientId, page);
  const ownRoleId = useOwnRoleId();
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
                  patientId={patientId}
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
