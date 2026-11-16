'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { CancelAppointmentDialog } from '@/components/appointments/cancel-appointment-dialog';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import { useT } from '@/lib/i18n/use-t';
import { AdminPageHeader } from '../shared/admin-page-header';
import { QueryState } from '../shared/query-state';
import { useStepBackWhenPageEmpty } from '../shared/use-step-back-when-page-empty';
import { adminAppointmentFilterFromParams, adminAppointmentFilterToQuery, defaultAdminAppointmentFilter, type AdminAppointmentFilter } from './admin-appointment-filter';
import { AdminAppointmentsFilters } from './admin-appointments-filters';
import { AdminAppointmentsTable } from './admin-appointments-table';
import { useAdminAppointments } from './use-admin-appointments';

const APPOINTMENTS_PATH = '/admin/appointments';

/** Mirrors the filter into the address bar without a navigation (the same way the audit page does). */
function writeFilterToUrl(filter: AdminAppointmentFilter): void {
  const query: string = adminAppointmentFilterToQuery(filter);
  window.history.replaceState(null, '', query === '' ? APPOINTMENTS_PATH : `${APPOINTMENTS_PATH}?${query}`);
}

function isFiltered(filter: AdminAppointmentFilter): boolean {
  const initial: AdminAppointmentFilter = defaultAdminAppointmentFilter();
  return filter.doctorId !== '' || filter.status !== '' || filter.from !== initial.from || filter.to !== initial.to;
}

export function AdminAppointmentsPanel(): ReactNode {
  const t = useT('admin.appointments');
  const params: URLSearchParams = useSearchParams();
  const [filter, setFilter] = useState<AdminAppointmentFilter>(() => adminAppointmentFilterFromParams(params));
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AppointmentView | null>(null);
  const closeDialog = useCallback(() => setTarget(null), []);
  const query = useAdminAppointments(filter, page);
  useStepBackWhenPageEmpty(query.data, page, setPage);
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <AdminAppointmentsFilters filter={filter} onApply={(next) => { setFilter(next); setPage(1); writeFilterToUrl(next); }} />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t(isFiltered(filter) ? 'emptyFiltered' : 'empty')} emptyDescription={t(isFiltered(filter) ? 'emptyFilteredHint' : 'emptyHint')}>
        {(data) => (
          <>
            <p role="status" className="mb-2 text-sm text-[var(--muted-foreground)]">{t('total', { count: data.meta.totalItems })}</p>
            <AdminAppointmentsTable rows={data.items} meta={data.meta} onPage={setPage} onCancel={setTarget} />
          </>
        )}
      </QueryState>
      {target === null ? null : <CancelAppointmentDialog appointment={target} onClose={closeDialog} onCancelled={closeDialog} />}
    </>
  );
}
