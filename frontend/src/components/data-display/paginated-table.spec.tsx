import { render, screen, within } from '@testing-library/react';
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

type TableProps = Parameters<typeof PaginatedTable<Row>>[0];

function renderTable(overrides: Partial<TableProps> = {}): void {
  render(<PaginatedTable<Row> columns={COLUMNS} rows={ROWS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} {...overrides} />);
}

describe('PaginatedTable', () => {
  it('should render the header and every row', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Название' })).toBeInTheDocument();
    expect(screen.getAllByText('Терапия').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Кардиология').length).toBeGreaterThan(0);
  });

  it('should show the current page out of the total', () => {
    renderTable({ meta: meta({ page: 2 }) });

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('should disable the previous button on the first page', () => {
    renderTable({ meta: meta({ page: 1 }) });

    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
  });

  it('should disable the next button on the last page', () => {
    renderTable({ meta: meta({ page: 3 }) });

    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('should request the next page when next is clicked', async () => {
    const onPage = jest.fn();
    renderTable({ meta: meta({ page: 2 }), onPage });

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('should request the previous page when previous is clicked', async () => {
    const onPage = jest.fn();
    renderTable({ meta: meta({ page: 2 }), onPage });

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущая страница' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('should show page 1 of 1 and disable both buttons for an empty list', () => {
    renderTable({ rows: [], meta: meta({ page: 1, totalItems: 0, totalPages: 0 }) });

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('should name the pager landmark and announce the page change politely', () => {
    renderTable();

    expect(screen.getByRole('navigation', { name: 'Пагинация' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toHaveAttribute('aria-live', 'polite');
  });

  it('should give the table an accessible caption when one is passed', () => {
    renderTable({ caption: 'Услуги клиники' });

    expect(screen.getByRole('table', { name: 'Услуги клиники' })).toBeInTheDocument();
  });

  it('should render a plain header for a column without a sortKey', () => {
    renderTable({ onSort: jest.fn() });

    expect(screen.getByRole('columnheader', { name: 'Название' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('button', { name: /Название/ })).not.toBeInTheDocument();
  });

  describe('sorting', () => {
    const SORTABLE = [{ key: 'name', header: 'Название', sortKey: 'name', render: (row: Row) => row.name }];

    it('should ask for ascending order when an unsorted column is clicked', async () => {
      const onSort = jest.fn();
      renderTable({ columns: SORTABLE, onSort });

      await userEvent.click(screen.getByRole('button', { name: /Название/ }));

      expect(onSort).toHaveBeenCalledWith({ sortBy: 'name', sortOrder: 'asc' });
    });

    it('should toggle to descending when the column is already sorted ascending', async () => {
      const onSort = jest.fn();
      renderTable({ columns: SORTABLE, sort: { sortBy: 'name', sortOrder: 'asc' }, onSort });

      await userEvent.click(screen.getByRole('button', { name: /Название/ }));

      expect(onSort).toHaveBeenCalledWith({ sortBy: 'name', sortOrder: 'desc' });
    });

    it('should expose the sort direction to assistive technology', () => {
      renderTable({ columns: SORTABLE, sort: { sortBy: 'name', sortOrder: 'desc' }, onSort: jest.fn() });

      expect(screen.getByRole('columnheader', { name: /Название/ })).toHaveAttribute('aria-sort', 'descending');
    });

    it('should mark a sortable column that is not the active sort as none', () => {
      renderTable({ columns: SORTABLE, sort: { sortBy: 'other', sortOrder: 'asc' }, onSort: jest.fn() });

      expect(screen.getByRole('columnheader', { name: /Название/ })).toHaveAttribute('aria-sort', 'none');
    });
  });
});

describe('PaginatedTable long values', () => {
  const LONG = '3882171c-26eb-4a0e-9d63-9f6c0b2d8e11';
  const rows: ReadonlyArray<Row> = [{ id: LONG, name: LONG }];

  it('should keep a truncated column to one line and carry the whole value as its tooltip', () => {
    const columns = [{ key: 'name', header: 'Идентификатор', render: (row: Row) => row.name, truncate: 'max-w-[10rem]' }];
    renderTable({ columns, rows });

    const cell = screen.getAllByTitle(LONG)[0] as HTMLElement;

    expect(cell).toHaveClass('truncate', 'max-w-[10rem]');
  });

  it('should take the tooltip from titleOf when the cell is not plain text', () => {
    const columns = [{ key: 'name', header: 'Кто', render: (row: Row) => <b>{row.name.slice(0, 8)}</b>, truncate: 'max-w-[10rem]', titleOf: (row: Row) => `Полностью: ${row.id}` }];
    renderTable({ columns, rows });

    expect(screen.getAllByTitle(`Полностью: ${LONG}`)).toHaveLength(1);
  });

  it('should keep the header in view while the body scrolls and tint the row under the pointer', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Название' })).toHaveClass('sticky', 'top-0');
    expect(screen.getAllByRole('row')[1]).toHaveClass('hover:bg-primary-soft');
  });
});

describe('PaginatedTable on a phone (compact cards)', () => {
  interface UserRow {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly email: string;
  }
  const USERS: ReadonlyArray<UserRow> = [{ id: 'u1', name: 'Иванова Мария', role: 'Врач', email: 'ivanova@example.test' }];
  const columns = [
    { key: 'name', header: 'Пользователь', render: (row: UserRow) => row.name },
    { key: 'role', header: 'Роль', mobile: 'badge' as const, render: (row: UserRow) => <span data-testid="role-chip">{row.role}</span> },
    { key: 'email', header: 'Почта', render: (row: UserRow) => row.email },
    { key: 'internal', header: 'Служебное', mobile: 'hidden' as const, render: () => 'служебное-значение' },
    { key: 'actions', header: 'Действия', mobile: 'actions' as const, render: () => <button type="button">Действия строки</button> },
  ];

  function cards(): HTMLElement {
    render(<PaginatedTable<UserRow> columns={columns} rows={USERS} meta={meta()} onPage={jest.fn()} rowKey={(r) => r.id} />);
    return screen.getByTestId('table-cards');
  }

  it('should show the first column as the title and the badge column as a chip when the row is a card', () => {
    const list = cards();

    expect(within(list).getByText('Иванова Мария')).toHaveClass('font-semibold');
    expect(within(list).getByTestId('role-chip')).toBeInTheDocument();
  });

  it('should not print the title, badge and actions columns as «Колонка: значение» lines', () => {
    const list = cards();

    expect(within(list).queryByText('Пользователь', { exact: false })).not.toBeInTheDocument();
    expect(within(list).queryByText('Роль', { exact: false })).not.toBeInTheDocument();
    expect(within(list).queryByText('Действия', { exact: false, selector: 'dt' })).not.toBeInTheDocument();
  });

  it('should keep the other columns as small labelled details and drop a hidden one', () => {
    const list = cards();

    expect(within(list).getByText('Почта')).toBeInTheDocument();
    expect(within(list).getByText('ivanova@example.test')).toBeInTheDocument();
    expect(within(list).queryByText('служебное-значение')).not.toBeInTheDocument();
  });

  it('should keep the row actions in the top corner of the card', () => {
    const list = cards();

    expect(within(list).getByRole('button', { name: 'Действия строки' })).toBeInTheDocument();
  });
});
