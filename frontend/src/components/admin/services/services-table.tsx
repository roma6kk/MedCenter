'use client';

import { Ban, Pencil, Trash2 } from 'lucide-react';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/use-t';
import type { AdminService } from './service-types';

interface ServicesTableProps {
  readonly rows: ReadonlyArray<AdminService>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly onEdit: (service: AdminService) => void;
  readonly onDelete: (service: AdminService) => void;
}

function ServiceActions({ service, onEdit, onDelete }: Pick<ServicesTableProps, 'onEdit' | 'onDelete'> & { readonly service: AdminService }): React.JSX.Element {
  const t = useT('admin.services');
  const tCommon = useT('admin.common');
  const items: ReadonlyArray<MenuItem> = [
    { key: 'edit', label: t('edit'), icon: Pencil, onSelect: () => onEdit(service) },
    { key: 'delete', label: t('delete'), icon: Trash2, destructive: true, onSelect: () => onDelete(service) },
  ];
  return <DropdownMenu label={tCommon('rowActions', { name: service.name })} items={items} />;
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
          {row.typeDisplay && row.typeDisplay !== row.name ? <span className="text-xs text-[var(--muted-foreground)]">{row.typeDisplay}</span> : null}
        </span>
      ),
    },
    { key: 'duration', header: t('columns.duration'), render: (row) => t('minutes', { count: row.defaultDurationMin }) },
    { key: 'status', header: t('columns.status'), mobile: 'badge', render: (row) => row.isActive ? <StampBadge status="active">{t('active')}</StampBadge> : <StampBadge status="cancelled" tone="neutral" icon={Ban}>{t('inactive')}</StampBadge> },
    { key: 'actions', header: t('columns.actions'), mobile: 'actions', render: (row) => <ServiceActions service={row} {...actions} /> },
  ];
}

/** Service catalogue (FR-016): НСИ type code, default duration, status, edit and delete. */
export function ServicesTable({ rows, meta, onPage, onEdit, onDelete }: ServicesTableProps): React.JSX.Element {
  const t = useT('admin.services');
  const columns = useServiceColumns({ onEdit, onDelete });
  return <PaginatedTable<AdminService> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
