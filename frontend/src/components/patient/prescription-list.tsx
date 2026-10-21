'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pager } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { hasMessage } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import type { MedicationPrescription, Prescription, ServicePrescription } from './patient-types';
import { PrintButton } from './print-button';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useClampedPage } from './use-clamped-page';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useMyPrescriptions } from './use-patient-queries';
import { WRAP_TEXT } from './wrap-text';

export const PRESCRIPTIONS_PAGE_SIZE = 10;
export const ATC_SYSTEM = 'http://www.whocc.no/atc';

/** The stamp colour of a FHIR request status; the words come from the catalogue, the colour from what the status means. */
const STATUS_STAMP: Readonly<Record<string, StampStatus>> = {
  active: 'active',
  completed: 'completed',
  cancelled: 'cancelled',
  revoked: 'cancelled',
  stopped: 'cancelled',
  'entered-in-error': 'entered-in-error',
  draft: 'pending',
  'on-hold': 'pending',
};

function StatusStamp({ status }: { readonly status: string }): ReactNode {
  const t = useT('patient.prescriptions.status');
  const { locale } = useClinicFormat();
  const known: boolean = hasMessage(locale, `patient.prescriptions.status.${status}`);
  return <StampBadge status={STATUS_STAMP[status] ?? 'pending'}>{known ? t(status) : t('unknown')}</StampBadge>;
}

function MedicationBody({ item }: { readonly item: MedicationPrescription }): ReactNode {
  const t = useT('patient.prescriptions');
  return (
    <>
      <p className="form-label">{t('medication')}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
        <CodeChip code={item.atcCode} system={ATC_SYSTEM} />
        {item.atcDisplay ? <span className={`font-semibold ${WRAP_TEXT}`}>{item.atcDisplay}</span> : null}
      </p>
      <p className={`mt-2 text-sm ${WRAP_TEXT}`}><span className="text-[var(--muted-foreground)]">{t('dosage')}: </span>{item.dosageText}</p>
    </>
  );
}

/** A referral or an ordered service has a national-catalogue code and no ATC code, so it gets no ATC chip. */
function ServiceBody({ item }: { readonly item: ServicePrescription }): ReactNode {
  const t = useT('patient.prescriptions');
  return (
    <>
      <p className="form-label">{t('service')}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
        <CodeChip code={item.code} system={item.codeSystem} />
        {item.display ? <span className={`font-semibold ${WRAP_TEXT}`}>{item.display}</span> : null}
      </p>
    </>
  );
}

function PrescriptionCard({ item }: { readonly item: Prescription }): ReactNode {
  const t = useT('patient.prescriptions');
  const format = useClinicFormat();
  return (
    <li className="min-w-0">
      <article data-kind={item.kind} className="h-full rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">{item.kind === 'medication' ? <MedicationBody item={item} /> : <ServiceBody item={item} />}</div>
          <StatusStamp status={item.status} />
        </div>
        {item.note ? <p className={`mt-2 text-sm ${WRAP_TEXT}`}><span className="text-[var(--muted-foreground)]">{t('note')}: </span>{item.note}</p> : null}
        {item.authoredOn ? <p className="mt-3 text-xs text-[var(--muted-foreground)]">{t('authored')}: {format.date(item.authoredOn)}</p> : null}
      </article>
    </li>
  );
}

interface PanelProps {
  readonly query: ReturnType<typeof useMyPrescriptions>;
  readonly onPage: (page: number) => void;
}

function PrescriptionPanel({ query, onPage }: PanelProps): ReactNode {
  const t = useT('patient.prescriptions');
  if (query.data === undefined) return <QueryFailure query={query} embedded pending={<TableSkeleton />} />;
  if (query.data.items.length === 0) return <EmptyState title={t('empty')} description={t('emptyHint')} />;
  return (
    <>
      <ul aria-label={t('listLabel')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {query.data.items.map((item) => <PrescriptionCard key={`${item.kind}-${item.id}`} item={item} />)}
      </ul>
      {query.data.meta.totalPages > 1 ? <Pager meta={query.data.meta} onPage={onPage} /> : null}
    </>
  );
}

/** The patient's prescriptions (FR-007, API 7.7): drugs with their ATC code and dosage, and ordered services. */
export function PrescriptionList(): ReactNode {
  const t = useT('patient.prescriptions');
  const [page, setPage] = useState(1);
  const query = useMyPrescriptions({ page, pageSize: PRESCRIPTIONS_PAGE_SIZE });
  useClampedPage(query.data?.meta, page, setPage);
  useDocumentTitle(t('title'));
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="serif text-2xl font-bold">{t('title')}</h1>
        {query.data !== undefined && query.data.items.length > 0 ? <PrintButton label={t('print')} /> : null}
      </div>
      <div className="mt-4" aria-busy={query.isFetching}><PrescriptionPanel query={query} onPage={setPage} /></div>
    </section>
  );
}
