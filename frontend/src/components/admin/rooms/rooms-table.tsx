'use client';

import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import type { AdminRoom } from './room-types';
import { ROW_ACTION_CLASS } from '../shared/admin-styles';

interface RoomActionHandlers {
  readonly onUsage: (room: AdminRoom) => void;
  readonly onEdit: (room: AdminRoom) => void;
  readonly onDelete: (room: AdminRoom) => void;
}

interface RoomsTableProps extends RoomActionHandlers {
  readonly rows: ReadonlyArray<AdminRoom>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
}

function RoomActions({ room, onUsage, onEdit, onDelete }: RoomActionHandlers & { readonly room: AdminRoom }): React.JSX.Element {
  const t = useT('admin.rooms');
  return (
    <span className="flex flex-wrap gap-1">
      <button type="button" className={ROW_ACTION_CLASS} onClick={() => onUsage(room)} aria-label={t('usageAria', { name: room.name })}>
        {t('usage.open')}
      </button>
      <button type="button" className={ROW_ACTION_CLASS} onClick={() => onEdit(room)} aria-label={t('editAria', { name: room.name })}>
        {t('edit')}
      </button>
      <button type="button" className={ROW_ACTION_CLASS} onClick={() => onDelete(room)} aria-label={t('deleteAria', { name: room.name })}>
        {t('delete')}
      </button>
    </span>
  );
}

function useRoomColumns(actions: RoomActionHandlers): ReadonlyArray<TableColumn<AdminRoom>> {
  const t = useT('admin.rooms');
  return [
    { key: 'identifier', header: t('columns.identifier'), render: (row) => <CodeChip code={row.identifier} /> },
    { key: 'name', header: t('columns.name'), render: (row) => row.name },
    { key: 'floor', header: t('columns.floor'), render: (row) => row.floor ?? '—' },
    { key: 'description', header: t('columns.description'), render: (row) => row.description ?? '—' },
    { key: 'status', header: t('columns.status'), render: (row) => <StampBadge status={row.isActive ? 'active' : 'cancelled'}>{row.isActive ? t('active') : t('inactive')}</StampBadge> },
    { key: 'actions', header: t('columns.actions'), render: (row) => <RoomActions room={row} {...actions} /> },
  ];
}

/** Room list (FR-017): identifier, floor, status; occupancy drawer, edit and delete per row. */
export function RoomsTable({ rows, meta, onPage, onUsage, onEdit, onDelete }: RoomsTableProps): React.JSX.Element {
  const t = useT('admin.rooms');
  const columns = useRoomColumns({ onUsage, onEdit, onDelete });
  return <PaginatedTable<AdminRoom> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
