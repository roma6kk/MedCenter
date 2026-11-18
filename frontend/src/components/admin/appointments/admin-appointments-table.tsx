'use client';

import { CircleX } from 'lucide-react';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { doctorOf, isCancellable, type AppointmentView } from '@/components/appointments/appointment-types';
import { Button } from '@/components/ui/button';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';

interface AdminAppointmentsTableProps {
  readonly rows: ReadonlyArray<AppointmentView>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly onCancel: (appointment: AppointmentView) => void;
}

function useColumns(onCancel: (appointment: AppointmentView) => void): ReadonlyArray<TableColumn<AppointmentView>> {
  const t = useT('admin.appointments');
  const format = useClinicFormat();
  return [
    { key: 'start', header: t('columns.start'), mobile: 'title', render: (row) => <time dateTime={row.start} className="whitespace-nowrap">{format.dateTime(row.start)}</time> },
    { key: 'patient', header: t('columns.patient'), render: (row) => row.patientName ?? '—', truncate: 'max-w-[14rem]' },
    { key: 'doctor', header: t('columns.doctor'), render: (row) => doctorOf(row, '—'), truncate: 'max-w-[14rem]' },
    { key: 'service', header: t('columns.service'), render: (row) => row.serviceName ?? '—', truncate: 'max-w-[14rem]' },
    { key: 'status', header: t('columns.status'), mobile: 'badge', render: (row) => <StampBadge status={row.status} /> },
    {
      key: 'actions',
      header: t('columns.actions'),
      mobile: 'actions',
      render: (row) =>
        isCancellable(row.status) ? (
          <Button variant="quiet-danger" aria-label={t('cancelFor', { when: format.dateTime(row.start), patient: row.patientName ?? '—' })} onClick={() => onCancel(row)}>
            <CircleX aria-hidden="true" className="size-4" />
            {t('cancel')}
          </Button>
        ) : null,
    },
  ];
}

export function AdminAppointmentsTable({ rows, meta, onPage, onCancel }: AdminAppointmentsTableProps): React.JSX.Element {
  const t = useT('admin.appointments');
  const columns = useColumns(onCancel);
  return <PaginatedTable<AppointmentView> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
