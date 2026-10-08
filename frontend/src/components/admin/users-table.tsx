import { PaginatedTable, type PageMeta } from '@/components/data-display/paginated-table';
import { StampBadge } from '@/components/feedback/stamp-badge';

export interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
  readonly isActive?: boolean;
}

interface UsersTableProps {
  readonly rows: ReadonlyArray<UserRow>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
}

/** Admin user list (FR-015). Presentational: the page owns the query and the paging state. */
export function UsersTable({ rows, meta, onPage }: UsersTableProps): React.JSX.Element {
  return (
    <PaginatedTable<UserRow>
      rowKey={(row) => row.id}
      meta={meta}
      onPage={onPage}
      rows={rows}
      columns={[
        { key: 'name', header: 'Имя', render: (row) => row.name },
        { key: 'role', header: 'Роль', render: (row) => row.role ?? '—' },
        {
          key: 'status',
          header: 'Статус',
          render: (row) => (row.isActive === false ? <StampBadge status="cancelled">Деактивирован</StampBadge> : <StampBadge status="active">Активен</StampBadge>),
        },
      ]}
    />
  );
}
