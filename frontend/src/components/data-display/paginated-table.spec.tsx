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
});
