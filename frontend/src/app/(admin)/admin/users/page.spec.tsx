import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem } from '@/components/admin/shared/test-utils';
import type { PaginatedResponse } from '@/lib/api/pagination';
import type { AdminUser } from '@/components/admin/users/user-types';
import AdminUsersPage from './page';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function user(id: string, name: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    email: `${id}@medcenter.test`,
    firstName: name,
    lastName: 'Тестов',
    roles: ['DOCTOR'],
    patientRef: null,
    practitionerRoleRef: null,
    isActive: true,
    name,
    role: 'DOCTOR',
    ...overrides,
  };
}

function usersPage(page: number, items: ReadonlyArray<AdminUser>): PaginatedResponse<AdminUser> {
  return { items, meta: { page, pageSize: 10, totalItems: 25, totalPages: 3 } };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<AdminUsersPage />, { wrapper: Wrapper });
}

function requestedPaths(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/api/v1/admin/users'));
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/v1/admin/users?page=1&pageSize=10') return Promise.resolve(usersPage(1, [user('u1', 'Пользователь 1')]));
      if (path === '/api/v1/admin/users?page=2&pageSize=10') return Promise.resolve(usersPage(2, [user('u2', 'Пользователь 2')]));
      if (path === '/api/v1/admin/users?page=1&pageSize=10&role=PATIENT') return Promise.resolve(usersPage(1, [user('u3', 'Пациент 3', { roles: ['PATIENT'], role: 'PATIENT' })]));
      return Promise.resolve(undefined);
    });
  });

  it('should request the first page with the page size when it mounts', async () => {
    renderPage();

    await waitFor(() => expect(requestedPaths()).toContain('/api/v1/admin/users?page=1&pageSize=10'));
    expect((await screen.findAllByText('Пользователь 1')).length).toBeGreaterThan(0);
  });

  it('should request the next page when the next page button is pressed', async () => {
    renderPage();
    await screen.findAllByText('Пользователь 1');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(requestedPaths()).toContain('/api/v1/admin/users?page=2&pageSize=10'));
    expect((await screen.findAllByText('Пользователь 2')).length).toBeGreaterThan(0);
  });

  it('should send the role filter and return to the first page when the filter is applied', async () => {
    renderPage();
    await screen.findAllByText('Пользователь 1');

    await userEvent.selectOptions(screen.getByLabelText('Роль'), 'PATIENT');
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => expect(requestedPaths()).toContain('/api/v1/admin/users?page=1&pageSize=10&role=PATIENT'));
    expect((await screen.findAllByText('Пациент 3')).length).toBeGreaterThan(0);
  });

  it('should render the empty state when the page has no users', async () => {
    apiFetchMock.mockResolvedValue(usersPage(1, []));
    renderPage();

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
  });

  it('should render a problem banner with a retry button when the list fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('AdminUsersPage deactivation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should ask for confirmation and send DELETE for the account when the admin confirms', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ ...user('u1', 'Пользователь 1'), isActive: false });
      return Promise.resolve(usersPage(1, [user('u1', 'Пользователь 1')]));
    });
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Деактивировать учётную запись Пользователь 1' }))[0] as HTMLElement);

    await userEvent.click(within(screen.getByRole('dialog', { name: 'Деактивация учётной записи' })).getByRole('button', { name: 'Деактивировать' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/users/u1', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('should explain SELF_LOCKOUT inside the dialog and keep it open when the admin deactivates themselves', async () => {
    apiFetchMock.mockImplementation((_path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.reject(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'SELF_LOCKOUT: an administrator cannot deactivate or demote their own account' }));
      return Promise.resolve(usersPage(1, [user('u1', 'Пользователь 1')]));
    });
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Деактивировать учётную запись Пользователь 1' }))[0] as HTMLElement);

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Деактивировать' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Нельзя деактивировать собственную учётную запись');
  });

  it('should offer activation for a deactivated account and send isActive true when it is pressed', async () => {
    apiFetchMock.mockImplementation((_path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') return Promise.resolve(user('u1', 'Пользователь 1'));
      return Promise.resolve(usersPage(1, [user('u1', 'Пользователь 1', { isActive: false })]));
    });
    renderPage();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Активировать учётную запись Пользователь 1' }))[0] as HTMLElement);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/users/u1', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }));
  });

  it('should drop the failure of an activation when the admin turns the page', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') return Promise.reject(apiProblem({ status: 500, errorCode: 'INTERNAL' }));
      return Promise.resolve(usersPage(path.includes('page=2') ? 2 : 1, [user('u1', 'Пользователь 1', { isActive: false })]));
    });
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Активировать учётную запись Пользователь 1' }))[0] as HTMLElement);
    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument());
  });

  it('should send the activation once when the button is pressed again while the request runs', async () => {
    apiFetchMock.mockImplementation((_path: string, options?: RequestInit) =>
      options?.method === 'PATCH' ? new Promise(() => undefined) : Promise.resolve(usersPage(1, [user('u1', 'Пользователь 1', { isActive: false })])),
    );
    renderPage();
    const button = (await screen.findAllByRole('button', { name: 'Активировать учётную запись Пользователь 1' }))[0] as HTMLElement;

    await userEvent.click(button);
    await userEvent.click(button);

    expect(apiFetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  });
});
