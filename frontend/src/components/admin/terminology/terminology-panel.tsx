'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { AdminPageHeader } from '../shared/admin-page-header';
import { QueryState } from '../shared/query-state';
import { TerminologyImportPanel } from './terminology-import-panel';
import { useValueSets } from './use-terminology';
import { ValueSetTable } from './value-set-table';

/** `/admin/terminology` (FR-018): the seeded ValueSets and the snapshot import. */
export function TerminologyPanel(): ReactNode {
  const t = useT('admin.terminology');
  const query = useValueSets();
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <div className="grid grid-cols-1 gap-5">
        <section aria-labelledby="value-sets-title">
          <h2 id="value-sets-title" className="serif mb-3 text-lg font-semibold">{t('valueSets.title')}</h2>
          <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('valueSets.empty')} emptyDescription={t('valueSets.emptyHint')}>
            {(data) => <ValueSetTable rows={data.items} />}
          </QueryState>
        </section>
        <TerminologyImportPanel />
      </div>
    </>
  );
}
