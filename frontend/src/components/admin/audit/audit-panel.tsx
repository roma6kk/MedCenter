'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { AdminPageHeader } from '../shared/admin-page-header';
import { QueryState } from '../shared/query-state';
import { AuditFiltersForm } from './audit-filters-form';
import { defaultAuditFilter, type AuditFilter } from './audit-filter';
import { AuditTable } from './audit-table';
import { useAuditEvents } from './use-audit';

/** `/admin/audit` (FR-021): the period / resource / user filters and the server-paged journal. */
export function AuditPanel(): ReactNode {
  const t = useT('admin.audit');
  const [filter, setFilter] = useState<AuditFilter>(() => defaultAuditFilter());
  const [page, setPage] = useState(1);
  const query = useAuditEvents(filter, page);
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <AuditFiltersForm filter={filter} onApply={(next) => { setFilter(next); setPage(1); }} />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}>
        {(data) => (
          <>
            <p role="status" className="mb-2 text-sm text-[var(--muted-foreground)]">{t('total', { count: data.meta.totalItems })}</p>
            <AuditTable rows={data.items} meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}
