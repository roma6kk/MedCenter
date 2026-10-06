import type { ReactNode } from 'react';

export interface PageMeta { page: number; pageSize: number; totalItems: number; totalPages: number; }

interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; }

interface PaginatedTableProps<T> { readonly columns: ReadonlyArray<Column<T>>; readonly rows: ReadonlyArray<T>; readonly meta: PageMeta; readonly onPage: (page: number) => void; readonly rowKey: (row: T) => string; }

export function PaginatedTable<T>({ columns, rows, meta, onPage, rowKey }: PaginatedTableProps<T>): React.JSX.Element {
  return (
    <div>
      <div className="overflow-x-auto rounded-[6px] border border-[var(--border)] max-md:hidden">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--card)]">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className="h-11 px-3 text-left font-medium">{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-[var(--border)] hover:bg-[#F7F5EF]">
                {columns.map((c) => <td key={c.key} className="h-11 px-3">{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-3">
            {columns.map((c) => <p key={c.key} className="text-sm"><span className="text-[var(--muted-foreground)]">{c.header}: </span>{c.render(row)}</p>)}
          </div>
        ))}
      </div>
      <nav aria-label="Пагинация" className="mt-3 flex items-center gap-2">
        <button type="button" aria-label="Предыдущая страница" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} className="rounded-[6px] border border-[var(--border)] px-3 py-1 disabled:opacity-50">←</button>
        <span aria-current="page" className="text-sm">{meta.page} / {meta.totalPages}</span>
        <button type="button" aria-label="Следующая страница" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} className="rounded-[6px] border border-[var(--border)] px-3 py-1 disabled:opacity-50">→</button>
      </nav>
    </div>
  );
}
