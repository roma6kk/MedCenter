'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pill } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { BookLink } from './book-link';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState } from '@/components/feedback/states';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { useT } from '@/lib/i18n/use-t';
import type { MedicationPrescription, Prescription, ServicePrescription } from './patient-types';
import { PrintButton } from './print-button';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { SegmentedTabs, tabPanelProps, type TabOption } from './segmented-tabs';
import { useClampedPage } from './use-clamped-page';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { cn } from '@/lib/ui/cn';
import { useMyPrescriptions } from './use-patient-queries';
import { MedicationCard, ServiceCard } from './prescriptions/prescription-cards';
import { activeCounts, filterByStatus, groupByEncounter, type PrescriptionGroup, type StatusFilter } from './prescriptions/prescription-logic';
import { PrescriptionSide } from './prescriptions/prescription-side';

export const PRESCRIPTIONS_PAGE_SIZE = 10;

const LIST_CLASS = 'grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]';

function GroupSection({ group, index, enter }: { readonly group: PrescriptionGroup; readonly index: number; readonly enter: string | undefined }): ReactNode {
  const t = useT('patientPrescriptions');
  const format = useClinicFormat();
  const id = `rx-group-${index}`;
  let title: string = t('groupOther');
  if (group.encounterId !== null) title = group.date === undefined ? t('groupNoDate') : t('groupTitle', { date: format.date(group.date) });
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby={id} className="flex flex-col gap-3.5">
      <h2 id={id} className="text-lg font-bold">{title}</h2>
      <ul aria-labelledby={id} className={cn(LIST_CLASS, enter)}>
        {group.items.map((item) => <MedicationCard key={item.id} item={item as MedicationPrescription} />)}
      </ul>
    </Card>
  );
}

function ReferralsSection({ items, filter, enter }: { readonly items: ReadonlyArray<ServicePrescription>; readonly filter: StatusFilter; readonly enter: string | undefined }): ReactNode {
  const t = useT('patientPrescriptions');
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="rx-ref" className="flex flex-col gap-3">
      <h2 id="rx-ref" className="text-lg font-bold">{t('referralsTitle')}</h2>
      {items.length > 0 ? (
        <ul aria-labelledby="rx-ref" className={cn(LIST_CLASS, enter)}>{items.map((item) => <ServiceCard key={item.id} item={item} />)}</ul>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-card border border-dashed border-input p-4">
          <span className="text-base font-semibold">{filter === 'all' ? t('referralsEmpty') : t('referralsEmptyActive')}</span>
          <span className="text-sm text-muted-foreground">{t('referralsEmptyHint')}</span>
        </div>
      )}
    </Card>
  );
}

function ListBody({ items, filter }: { readonly items: ReadonlyArray<Prescription>; readonly filter: StatusFilter }): ReactNode {
  const t = useT('patientPrescriptions');
  const enter = useStaggerOnce();
  const shown = filterByStatus(items, filter);
  if (shown.length === 0 && filter !== 'all') {
    const key = filter === 'active' ? 'emptyActive' : 'emptyClosed';
    return <EmptyState title={t(key)} description={t(`${key}Hint`)} />;
  }
  const medications = shown.filter((item): item is MedicationPrescription => item.kind === 'medication');
  const services = shown.filter((item): item is ServicePrescription => item.kind === 'service');
  return (
    <>
      {groupByEncounter(medications).map((group, index) => <GroupSection key={group.encounterId ?? 'other'} group={group} index={index} enter={enter} />)}
      <ReferralsSection items={services} filter={filter} enter={enter} />
    </>
  );
}

export function PrescriptionList({ embedded = false }: { readonly embedded?: boolean }): ReactNode {
  const t = useT('patientPrescriptions');
  const tp = useT('patient.prescriptions');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = useMyPrescriptions({ page, pageSize: PRESCRIPTIONS_PAGE_SIZE });
  useClampedPage(query.data?.meta, page, setPage);
  useDocumentTitle(embedded ? null : tp('title'));
  const data = query.data;
  const options: ReadonlyArray<TabOption<StatusFilter>> = [
    { value: 'active', label: t('tabs.active') },
    { value: 'closed', label: t('tabs.closed') },
    { value: 'all', label: t('tabs.all') },
  ];
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {embedded ? null : <h1 className="text-3xl font-bold tracking-tight">{tp('title')}</h1>}
          <p className={embedded ? 'text-base text-muted-foreground' : 'mt-1.5 text-base text-muted-foreground'}>{t('subtitle')}</p>
        </div>
        {data !== undefined && data.items.length > 0 ? <PrintButton label={t('print')} /> : null}
      </div>
      {data === undefined ? <QueryFailure query={query} embedded pending={<ContentSkeleton shape="cards" rows={4} />} /> : null}
      {data !== undefined && data.items.length === 0 ? <EmptyState icon={Pill} title={tp('empty')} description={tp('emptyHint')} action={<BookLink label={tp('emptyCta')} />} /> : null}
      {data !== undefined && data.items.length > 0 ? (
        <>
          <SegmentedTabs idPrefix="rx" label={t('tabsLabel')} options={options} value={filter} onChange={setFilter} />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div {...tabPanelProps('rx', filter)} aria-busy={query.isFetching} className="flex min-w-0 flex-1 flex-col gap-5">
              <ListBody items={data.items} filter={filter} />
              {data.meta.totalPages > 1 ? <Pager meta={data.meta} onPage={setPage} /> : null}
            </div>
            <PrescriptionSide counts={activeCounts(data.items)} />
          </div>
        </>
      ) : null}
    </section>
  );
}
