import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryState } from './query-state';
import { apiProblem } from './test-utils';

type Query = Parameters<typeof QueryState<string[]>>[0]['query'];

function query(partial: Partial<Query>): Query {
  return { data: undefined, isPending: false, isError: false, error: null, refetch: jest.fn(), ...partial } as Query;
}

describe('QueryState', () => {
  it('should show the skeleton when the first load is running', () => {
    render(<QueryState query={query({ isPending: true })}>{() => <p>data</p>}</QueryState>);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should show the problem and refetch when «Повторить» is pressed after a failure', async () => {
    const refetch = jest.fn();
    render(
      <QueryState query={query({ isError: true, error: apiProblem({ status: 500, errorCode: 'INTERNAL' }), refetch })}>{() => <p>data</p>}</QueryState>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('should show the empty state when the data has nothing to list', () => {
    render(
      <QueryState query={query({ data: [] })} isEmpty={(rows) => rows.length === 0} emptyTitle="Пусто" emptyDescription="Создайте запись">
        {() => <p>data</p>}
      </QueryState>,
    );

    expect(screen.getByTestId('empty-state')).toHaveTextContent('Пусто');
  });

  it('should render the data when it is there', () => {
    render(<QueryState query={query({ data: ['a'] })}>{(rows) => <p>{rows.join(',')}</p>}</QueryState>);

    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('should hold «Повторить» closed and count the seconds when the failure was a 429 with Retry-After', async () => {
    const refetch = jest.fn();
    render(
      <QueryState query={query({ isError: true, error: apiProblem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 7 }), refetch })}>{() => <p>data</p>}</QueryState>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Повторите через 7 с.' }));

    expect(refetch).not.toHaveBeenCalled();
  });

  it('should mark the list busy and dim it when the previous page is shown for a new request', () => {
    const { container } = render(<QueryState query={query({ data: ['a'], isPlaceholderData: true })}>{(rows) => <p>{rows.join(',')}</p>}</QueryState>);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Обновляем данные…');
  });

  it('should not mark the list busy when the data is the answer to the current request', () => {
    const { container } = render(<QueryState query={query({ data: ['a'], isPlaceholderData: false })}>{(rows) => <p>{rows.join(',')}</p>}</QueryState>);

    expect(container.firstElementChild).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
