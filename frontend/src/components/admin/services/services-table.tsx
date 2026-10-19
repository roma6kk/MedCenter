'use client';

import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import type { AdminService } from './service-types';
import { ROW_ACTION_CLASS } from '../shared/admin-styles';

interface ServicesTableProps {
  readonly rows: ReadonlyArray<AdminService>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly onEdit: (service: AdminService) => void;
  readonly onDelete: (service: AdminService) => void;
}

function ServiceActions({ service, onEdit, onDelete }: Pick<ServicesTableProps, 'onEdit' | 'onDelete'> & { readonly service: AdminService }): React.JSX.Element {
  const t = useT('admin.services');
  return (
    <span className="flex gap-1">
      <button type="button" className={ROW_ACTION_CLASS} onClick={() => onEdit(service)} aria-label={t('editAria', { name: service.name })}>
        {t('edit')}
      </button>
      <button type="button" className={ROW_ACTION_CLASS} onClick={() => onDelete(service)} aria-label={t('deleteAria', { name: service.name })}>
        {t('delete')}
      </button>
    </span>
  );
}

function useServiceColumns(actions: Pick<ServicesTableProps, 'onEdit' | 'onDelete'>): ReadonlyArray<TableColumn<AdminService>> {
  const t = useT('admin.services');
  return [
    { key: 'name', header: t('columns.name'), render: (row) => row.name },
    {
      key: 'type',
      header: t('columns.type'),
      render: (row) => (
        <span className="grid justify-items-start gap-0.5">
          <CodeChip code={row.typeCode} system={row.typeSystem} />
          {row.typeDisplay ? <span className="text-xs text-[var(--muted-foreground)]">{row.typeDisplay}</span> : null}
        </span>
      ),
    },
    { key: 'duration', header: t('columns.duration'), render: (row) => t('minutes', { count: row.defaultDurationMin }) },
    { key: 'status', header: t('columns.status'), render: (row) => <StampBadge status={row.isActive ? 'active' : 'cancelled'}>{row.isActive ? t('active') : t('inactive')}</StampBadge> },
    { key: 'actions', header: t('columns.actions'), render: (row) => <ServiceActions service={row} {...actions} /> },
  ];
}

/** Service catalogue (FR-016): НСИ type code, default duration, status, edit and delete. */
export function ServicesTable({ rows, meta, onPage, onEdit, onDelete }: ServicesTableProps): React.JSX.Element {
  const t = useT('admin.services');
  const columns = useServiceColumns({ onEdit, onDelete });
  return <PaginatedTable<AdminService> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
