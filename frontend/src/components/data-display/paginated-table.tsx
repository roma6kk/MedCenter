'use client';

import type { ReactNode } from 'react';
import { pageLabel, type PageMeta, type SortOrder } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';

export type { PageMeta };

export interface SortState {
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
}

export interface TableColumn<TRow> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow) => ReactNode;
  /** Server `sortBy` value; makes the header a sort button (API §0: `sortBy`, `sortOrder`). */
  readonly sortKey?: string;
}

interface PaginatedTableProps<TRow> {
  readonly columns: ReadonlyArray<TableColumn<TRow>>;
  readonly rows: ReadonlyArray<TRow>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly rowKey: (row: TRow) => string;
  /** Accessible name of the table (screen-reader caption). */
  readonly caption?: string;
  readonly sort?: SortState;
  readonly onSort?: (sort: SortState) => void;
}

function nextSort(column: string, current: SortState | undefined): SortState {
  if (current?.sortBy !== column) return { sortBy: column, sortOrder: 'asc' };
  return { sortBy: column, sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' };
}

function ariaSortOf<TRow>(column: TableColumn<TRow>, sort: SortState | undefined): 'ascending' | 'descending' | 'none' | undefined {
  if (column.sortKey === undefined) return undefined;
  if (sort?.sortBy !== column.sortKey) return 'none';
  return sort.sortOrder === 'asc' ? 'ascending' : 'descending';
}

interface HeaderCellProps<TRow> {
  readonly column: TableColumn<TRow>;
  readonly sort: SortState | undefined;
  readonly onSort: ((sort: SortState) => void) | undefined;
}

function HeaderCell<TRow>({ column, sort, onSort }: HeaderCellProps<TRow>): ReactNode {
  const t = useT('pagination');
  const { sortKey } = column;
  const isSortable: boolean = sortKey !== undefined && onSort !== undefined;
  const direction = ariaSortOf(column, sort);
  const suffix: string = direction === 'ascending' ? ' ↑' : direction === 'descending' ? ' ↓' : '';
  const hint: string = direction === 'ascending' ? t('sortAscending') : direction === 'descending' ? t('sortDescending') : '';
  return (
    <th scope="col" aria-sort={direction} className="h-11 px-3 text-left text-[13px] font-semibold text-[var(--muted-foreground)]">
      {isSortable && sortKey !== undefined ? (
        <button type="button" onClick={() => onSort?.(nextSort(sortKey, sort))} className="min-h-[24px] font-semibold hover:underline">
          {column.header}
          <span aria-hidden="true">{suffix}</span>
          {hint ? <span className="sr-only">, {hint}</span> : null}
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

/** Previous / next with a `n / total` status; exported so non-tabular lists (timelines, cards) page the same way. */
export function Pager({ meta, onPage }: { readonly meta: PageMeta; readonly onPage: (page: number) => void }): ReactNode {
  const t = useT('pagination');
  const { current, total } = pageLabel(meta);
  const buttonClass = 'min-h-[44px] min-w-[44px] rounded-control border border-[var(--border)] bg-[var(--card)] px-3 py-1 hover:bg-secondary disabled:opacity-50';
  return (
    <nav aria-label={t('label')} className="mt-3 flex items-center gap-2">
      <button type="button" aria-label={t('previous')} disabled={current <= 1} onClick={() => onPage(current - 1)} className={buttonClass}>
        <span aria-hidden="true">←</span>
      </button>
      <span aria-current="page" aria-live="polite" className="text-sm">{t('status', { current, total })}</span>
      <button type="button" aria-label={t('next')} disabled={current >= total} onClick={() => onPage(current + 1)} className={buttonClass}>
        <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}

interface RowsProps<TRow> {
  readonly columns: ReadonlyArray<TableColumn<TRow>>;
  readonly rows: ReadonlyArray<TRow>;
  readonly rowKey: (row: TRow) => string;
}

function DesktopTable<TRow>({ columns, rows, rowKey, caption, sort, onSort }: RowsProps<TRow> & Pick<PaginatedTableProps<TRow>, 'caption' | 'sort' | 'onSort'>): ReactNode {
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)] bg-[var(--card)] max-xl:hidden">
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 bg-[var(--secondary)]">
          <tr>{columns.map((column) => <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-[var(--border)] hover:bg-secondary">
              {columns.map((column) => <td key={column.key} className="h-12 px-3">{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards<TRow>({ columns, rows, rowKey }: RowsProps<TRow>): ReactNode {
  return (
    <div className="grid gap-2 xl:hidden">
      {rows.map((row) => (
        <div key={rowKey(row)} className="rounded-card border border-[var(--border)] bg-[var(--card)] p-3">
          {columns.map((column) => (
            <p key={column.key} className="text-sm"><span className="text-[var(--muted-foreground)]">{column.header}: </span>{column.render(row)}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Server-paginated table (`meta` from `PaginatedResponse`); a table on ≥ md, cards below. */
export function PaginatedTable<TRow>({ meta, onPage, ...table }: PaginatedTableProps<TRow>): React.JSX.Element {
  return (
    <div>
      <DesktopTable {...table} />
      <MobileCards columns={table.columns} rows={table.rows} rowKey={table.rowKey} />
      <Pager meta={meta} onPage={onPage} />
    </div>
  );
}
