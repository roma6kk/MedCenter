import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import AdminUsersPage from './page';
import { apiFetch } from '@/lib/api/api-fetch';
import type { ReactNode } from 'react';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

interface UsersResponse {
  readonly items: ReadonlyArray<{ id: string; name: string }>;
  readonly meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

function usersResponse(page: number, items?: ReadonlyArray<{ id: string; name: string }>): UsersResponse {
  return {
    items: items ?? [{ id: `u${page}`, name: `Пользователь ${page}` }],
    meta: { page, pageSize: 10, totalItems: 25, totalPages: 3 },
  };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<AdminUsersPage />, { wrapper: Wrapper });
}

function requestedPages(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls
    .map(([path]) => path)
    .filter((path) => path.startsWith('/api/v1/admin/users'));
}

describe('AdminUsersPage pagination', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/v1/admin/users?page=1') return Promise.resolve(usersResponse(1));
      if (path === '/api/v1/admin/users?page=2') return Promise.resolve(usersResponse(2));
      if (path === '/api/v1/me/notifications/unread-count') return Promise.resolve({ unread: 0 });
      return Promise.resolve(undefined);
    });
  });

  it('should request the first page on mount', async () => {
    renderPage();

    await waitFor(() => expect(requestedPages()).toContain('/api/v1/admin/users?page=1'));
    await waitFor(() => expect(screen.getAllByText('Пользователь 1').length).toBeGreaterThan(0));
  });

  it('should request the next page with the clicked page number', async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Пользователь 1').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(requestedPages()).toContain('/api/v1/admin/users?page=2'));
    await waitFor(() => expect(screen.getAllByText('Пользователь 2').length).toBeGreaterThan(0));
  });

  it('should render the empty state when the page has no users', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/v1/admin/users?page=1') return Promise.resolve(usersResponse(1, []));
      if (path === '/api/v1/me/notifications/unread-count') return Promise.resolve({ unread: 0 });
      return Promise.resolve(undefined);
    });
    renderPage();

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
  });
});
