import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginatedTable, type PageMeta } from './paginated-table';

interface Row {
  readonly id: string;
  readonly name: string;
}

const COLUMNS = [{ key: 'name', header: 'Название', render: (row: Row) => row.name }];

const ROWS: ReadonlyArray<Row> = [
  { id: '1', name: 'Терапия' },
  { id: '2', name: 'Кардиология' },
];

function meta(overrides: Partial<PageMeta> = {}): PageMeta {
  return { page: 1, pageSize: 2, totalItems: 6, totalPages: 3, ...overrides };
}

describe('PaginatedTable', () => {
  it('should render the header and every row', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByRole('columnheader', { name: 'Название' })).toBeInTheDocument();
    expect(screen.getAllByText('Терапия').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Кардиология').length).toBeGreaterThan(0);
  });

  it('should show the current page out of the total', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta({ page: 2 })} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('should disable the previous button on the first page', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta({ page: 1 })} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
  });

  it('should disable the next button on the last page', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta({ page: 3 })} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('should request the next page when next is clicked', async () => {
    const onPage = jest.fn();
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta({ page: 2 })} onPage={onPage} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('should request the previous page when previous is clicked', async () => {
    const onPage = jest.fn();
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta({ page: 2 })} onPage={onPage} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущая страница' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('should show page 1 of 1 and disable both buttons for an empty list', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={[]} meta={meta({ page: 1, totalItems: 0, totalPages: 0 })} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('should name the pager landmark and announce the page change politely', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} />);

    expect(screen.getByRole('navigation', { name: 'Пагинация' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toHaveAttribute('aria-live', 'polite');
  });

  it('should give the table an accessible caption when one is passed', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} caption="Услуги клиники" />);

    expect(screen.getByRole('table', { name: 'Услуги клиники' })).toBeInTheDocument();
  });

  it('should render a plain header for a column without a sortKey', () => {
    render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} onSort={jest.fn()} />);

    expect(screen.getByRole('columnheader', { name: 'Название' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('button', { name: /Название/ })).not.toBeInTheDocument();
  });

  describe('sorting', () => {
    const SORTABLE = [{ key: 'name', header: 'Название', sortKey: 'name', render: (row: Row) => row.name }];

    it('should ask for ascending order when an unsorted column is clicked', async () => {
      const onSort = jest.fn();
      render(<PaginatedTable<Row> columns={SORTABLE} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} onSort={onSort} />);

      await userEvent.click(screen.getByRole('button', { name: /Название/ }));

      expect(onSort).toHaveBeenCalledWith({ sortBy: 'name', sortOrder: 'asc' });
    });

    it('should toggle to descending when the column is already sorted ascending', async () => {
      const onSort = jest.fn();
      render(<PaginatedTable<Row> columns={SORTABLE} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} sort={{ sortBy: 'name', sortOrder: 'asc' }} onSort={onSort} />);

      await userEvent.click(screen.getByRole('button', { name: /Название/ }));

      expect(onSort).toHaveBeenCalledWith({ sortBy: 'name', sortOrder: 'desc' });
    });

    it('should expose the sort direction to assistive technology', () => {
      render(<PaginatedTable<Row> columns={SORTABLE} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} sort={{ sortBy: 'name', sortOrder: 'desc' }} onSort={jest.fn()} />);

      expect(screen.getByRole('columnheader', { name: /Название/ })).toHaveAttribute('aria-sort', 'descending');
    });

    it('should mark a sortable column that is not the active sort as none', () => {
      render(<PaginatedTable<Row> columns={SORTABLE} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} sort={{ sortBy: 'other', sortOrder: 'asc' }} onSort={jest.fn()} />);

      expect(screen.getByRole('columnheader', { name: /Название/ })).toHaveAttribute('aria-sort', 'none');
    });
  });
});
