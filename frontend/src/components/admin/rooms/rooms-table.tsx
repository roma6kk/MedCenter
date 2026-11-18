'use client';

import { CalendarRange, Pencil, Trash2 } from 'lucide-react';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import type { MenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/use-t';
import type { AdminRoom } from './room-types';
import { ActiveStatusBadge } from '../shared/active-status-badge';
import { RowActionsMenu } from '../shared/row-actions-menu';

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
  const items: ReadonlyArray<MenuItem> = [
    { key: 'edit', label: t('edit'), icon: Pencil, onSelect: () => onEdit(room) },
    { key: 'usage', label: t('usage.open'), icon: CalendarRange, onSelect: () => onUsage(room) },
    { key: 'delete', label: t('delete'), icon: Trash2, destructive: true, onSelect: () => onDelete(room) },
  ];
  return <RowActionsMenu name={room.name} items={items} />;
}

function useRoomColumns(actions: RoomActionHandlers): ReadonlyArray<TableColumn<AdminRoom>> {
  const t = useT('admin.rooms');
  return [
    { key: 'identifier', header: t('columns.identifier'), mobile: 'badge', render: (row) => <CodeChip code={row.identifier} /> },
    { key: 'name', header: t('columns.name'), mobile: 'title', render: (row) => row.name },
    { key: 'floor', header: t('columns.floor'), render: (row) => row.floor ?? '—' },
    { key: 'description', header: t('columns.description'), render: (row) => row.description ?? '—' },
    { key: 'status', header: t('columns.status'), mobile: 'badge', render: (row) => <ActiveStatusBadge isActive={row.isActive} activeLabel={t('active')} inactiveLabel={t('inactive')} /> },
    { key: 'actions', header: t('columns.actions'), mobile: 'actions', render: (row) => <RoomActions room={row} {...actions} /> },
  ];
}

export function RoomsTable({ rows, meta, onPage, onUsage, onEdit, onDelete }: RoomsTableProps): React.JSX.Element {
  const t = useT('admin.rooms');
  const columns = useRoomColumns({ onUsage, onEdit, onDelete });
  return <PaginatedTable<AdminRoom> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
