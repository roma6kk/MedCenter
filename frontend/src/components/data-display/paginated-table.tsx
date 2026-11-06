'use client';

import type { ReactNode } from 'react';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { pageLabel, type PageMeta, type SortOrder } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';

export type { PageMeta };

interface SortState {
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
}

export interface TableColumn<TRow> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow) => ReactNode;
  readonly sortKey?: string;
  readonly truncate?: string;
  readonly titleOf?: (row: TRow) => string | undefined;
  readonly mobile?: 'title' | 'badge' | 'actions' | 'hidden';
}

interface PaginatedTableProps<TRow> {
  readonly columns: ReadonlyArray<TableColumn<TRow>>;
  readonly rows: ReadonlyArray<TRow>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly rowKey: (row: TRow) => string;
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
    <th scope="col" aria-sort={direction} className="sticky top-0 z-10 h-11 whitespace-nowrap bg-secondary px-2.5 text-left text-xs font-semibold text-muted-foreground shadow-[0_1px_0_var(--border)]">
      {isSortable && sortKey !== undefined ? (
        <button type="button" onClick={() => onSort?.(nextSort(sortKey, sort))} className="min-h-[44px] font-semibold hover:underline">
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

export function Pager({ meta, onPage }: { readonly meta: PageMeta; readonly onPage: (page: number) => void }): ReactNode {
  const t = useT('pagination');
  const { current, total } = pageLabel(meta);
  const buttonClass = 'min-h-[44px] min-w-[44px] rounded-control border border-[var(--border)] bg-[var(--card)] px-3 py-1 transition-[background-color,transform] duration-fast ease-out hover:bg-secondary active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100';
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

function CellContent<TRow>({ column, row }: { readonly column: TableColumn<TRow>; readonly row: TRow }): ReactNode {
  const content: ReactNode = column.render(row);
  if (column.truncate === undefined) return content;
  const title: string | undefined = column.titleOf?.(row) ?? (typeof content === 'string' ? content : undefined);
  return <span title={title} className={cn('block truncate', column.truncate)}>{content}</span>;
}

function DesktopTable<TRow>({ columns, rows, rowKey, caption, sort, onSort, enter }: RowsProps<TRow> & Pick<PaginatedTableProps<TRow>, 'caption' | 'sort' | 'onSort'> & { readonly enter: string | undefined }): ReactNode {
  return (
    <div className="max-h-[min(75vh,56rem)] overflow-auto rounded-card border border-border-soft bg-card shadow-elev-1 max-xl:hidden">
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>{columns.map((column) => <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />)}</tr>
        </thead>
        <tbody className={enter}>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border-soft transition-[background-color] duration-fast ease-out hover:bg-primary-soft">
              {columns.map((column) => <td key={column.key} className="h-14 px-2.5"><CellContent column={column} row={row} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mobileRoleOf<TRow>(column: TableColumn<TRow>, index: number, hasTitle: boolean): NonNullable<TableColumn<TRow>['mobile']> | 'detail' {
  if (column.mobile !== undefined) return column.mobile;
  return index === 0 && !hasTitle ? 'title' : 'detail';
}

function MobileCards<TRow>({ columns, rows, rowKey, enter }: RowsProps<TRow> & { readonly enter: string | undefined }): ReactNode {
  const hasTitle: boolean = columns.some((column) => column.mobile === 'title');
  const roles = columns.map((column, index) => ({ column, role: mobileRoleOf(column, index, hasTitle) }));
  const pick = (role: string): ReadonlyArray<TableColumn<TRow>> => roles.filter((entry) => entry.role === role).map((entry) => entry.column);
  const titles = pick('title');
  const badges = pick('badge');
  const actions = pick('actions');
  const details = pick('detail');
  return (
    <ul data-testid="table-cards" className={cn('grid gap-2.5 xl:hidden', enter)}>
      {rows.map((row) => (
        <li key={rowKey(row)} className="min-w-0 rounded-card border border-border-soft bg-card p-3.5 shadow-elev-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <div className="flex min-w-0 flex-[1_1_9rem] flex-col gap-2">
              {titles.map((column) => <div key={column.key} className="min-w-0 font-semibold [overflow-wrap:anywhere]">{column.render(row)}</div>)}
              {badges.length === 0 ? null : <div className="flex flex-wrap items-center gap-1.5">{badges.map((column) => <span key={column.key}>{column.render(row)}</span>)}</div>}
            </div>
            {actions.length === 0 ? null : <div className="-my-1.5 -mr-1.5 ml-auto flex flex-none">{actions.map((column) => <span key={column.key}>{column.render(row)}</span>)}</div>}
          </div>
          {details.length === 0 ? null : (
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border-soft pt-3 text-sm">
              {details.map((column) => (
                <div key={column.key} className="flex min-w-0 flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PaginatedTable<TRow>({ meta, onPage, ...table }: PaginatedTableProps<TRow>): React.JSX.Element {
  const enter = useStaggerOnce();
  return (
    <div>
      <DesktopTable {...table} enter={enter} />
      <MobileCards columns={table.columns} rows={table.rows} rowKey={table.rowKey} enter={enter} />
      <Pager meta={meta} onPage={onPage} />
    </div>
  );
}
