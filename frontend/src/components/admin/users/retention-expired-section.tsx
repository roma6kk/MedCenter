'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { PaginatedTable, type TableColumn } from '@/components/data-display/paginated-table';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { QueryState } from '../shared/query-state';
import { useRetentionExpired } from './use-admin-users';
import type { RetentionExpiredAccount } from './user-types';

function DateCell({ iso }: { readonly iso: string }): ReactNode {
  const locale = useUiStore((state) => state.locale);
  return <time dateTime={iso} className="whitespace-nowrap tabular-nums">{formatClinicDateTime(iso, locale)}</time>;
}

function useRetentionColumns(): ReadonlyArray<TableColumn<RetentionExpiredAccount>> {
  const t = useT('admin.users.retention');
  return [
    { key: 'name', header: t('columns.name'), mobile: 'title', render: (row) => row.name },
    { key: 'closedAt', header: t('columns.closedAt'), render: (row) => <DateCell iso={row.closedAt} /> },
    { key: 'retentionUntil', header: t('columns.retentionUntil'), render: (row) => <DateCell iso={row.retentionUntil} /> },
  ];
}

function RetentionList(): ReactNode {
  const t = useT('admin.users.retention');
  const [page, setPage] = useState(1);
  const query = useRetentionExpired(page);
  const columns = useRetentionColumns();
  return (
    <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')}>
      {(data) => <PaginatedTable<RetentionExpiredAccount> caption={t('title')} rowKey={(row) => row.id} meta={data.meta} onPage={setPage} rows={data.items} columns={columns} />}
    </QueryState>
  );
}

export function RetentionExpiredSection(): ReactNode {
  const t = useT('admin.users.retention');
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-8" aria-labelledby="retention-expired-title">
      <h2 id="retention-expired-title" className="text-base font-semibold">
        <button type="button" aria-expanded={open} aria-controls="retention-expired-body" onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 rounded-md py-1">
          {t('title')}
          <ChevronDown aria-hidden className={open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} />
        </button>
      </h2>
      <div id="retention-expired-body" hidden={!open} className="mt-2">
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('description')}</p>
        {open ? <RetentionList /> : null}
      </div>
    </section>
  );
}
