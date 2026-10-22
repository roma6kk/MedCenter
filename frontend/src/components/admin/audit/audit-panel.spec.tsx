import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, pageOf, renderWithClient } from '../shared/test-utils';
import { defaultAuditFilter } from './audit-filter';
import { AuditPanel } from './audit-panel';
import type { AuditEvent } from './audit-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const events: ReadonlyArray<AuditEvent> = [
  { id: '1', occurredAt: '2026-10-16T07:31:35.905Z', userId: 'a48dab5b-67da-4ed7-a9be-f047cd9925c7', action: 'create', resourceType: 'Patient', resourceId: '2537', requestId: '3882171c-26eb-4417-a8aa-3281fde8c982' },
  { id: '2', occurredAt: '2026-10-16T07:27:29.660Z', userId: '19d9172b-681f-4e46-a451-43215ce442d4', action: 'update', resourceType: '', resourceId: '', requestId: '' },
];

function paged(totalPages: number): unknown {
  return { items: events, meta: { page: 1, pageSize: 20, totalItems: 41, totalPages } };
}

function auditPaths(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/api/v1/admin/audit'));
}

describe('AuditPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(paged(3));
  });

  it('should request the last 30 days with a page size of 20 when it opens', async () => {
    renderWithClient(<AuditPanel />);
    const { from, to } = defaultAuditFilter();

    await screen.findByText('Найдено событий: 41');

    expect(auditPaths()).toContain(`/api/v1/admin/audit?from=${from}&to=${to}&page=1&pageSize=20`);
  });

  it('should name the account next to its id when the user list knows it, and keep a bare id otherwise', async () => {
    const account = { id: 'a48dab5b-67da-4ed7-a9be-f047cd9925c7', name: 'Иванова Мария', email: 'x@y.test', firstName: 'Мария', lastName: 'Иванова', roles: ['DOCTOR'], role: 'DOCTOR', patientRef: null, practitionerRoleRef: null, isActive: true };
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.startsWith('/api/v1/admin/users') ? { items: [account], meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } } : paged(3)));
    renderWithClient(<AuditPanel />);

    const table = within(await screen.findByRole('table', { name: 'Журнал аудита' }));

    expect(await table.findByText('Иванова Мария')).toBeInTheDocument();
    expect(table.getByText('a48dab5b-67da-4ed7-a9be-f047cd9925c7')).toBeInTheDocument();
    expect(table.getByText('19d9172b-681f-4e46-a451-43215ce442d4')).toBeInTheDocument();
    expect(apiFetchMock.mock.calls.map(([path]) => path)).toContain('/api/v1/admin/users?page=1&pageSize=100');
  });

  it('should show when, who, what and on which resource for each event when the journal loads', async () => {
    renderWithClient(<AuditPanel />);

    const table = within(await screen.findByRole('table', { name: 'Журнал аудита' }));

    expect(await table.findByText('Patient/2537')).toBeInTheDocument();
    expect(table.getByText('Создание')).toBeInTheDocument();
    expect(table.getByText('Изменение')).toBeInTheDocument();
    expect(table.getByText('a48dab5b-67da-4ed7-a9be-f047cd9925c7')).toBeInTheDocument();
  });

  it('should offer to copy the request id only when the event has one', async () => {
    renderWithClient(<AuditPanel />);

    const table = within(await screen.findByRole('table', { name: 'Журнал аудита' }));

    expect(await table.findAllByRole('button', { name: /Скопировать идентификатор запроса/ })).toHaveLength(1);
    expect(table.getAllByTestId('no-request-id')).toHaveLength(1);
  });

  it('should show a dash when an event names no resource', async () => {
    renderWithClient(<AuditPanel />);

    const table = within(await screen.findByRole('table', { name: 'Журнал аудита' }));

    expect((await table.findAllByText('—')).length).toBeGreaterThan(0);
  });

  it('should send the period, entity and user filters and go back to page 1 when they are applied', async () => {
    renderWithClient(<AuditPanel />);
    await screen.findByText('Найдено событий: 41');

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-10-16' } });
    await userEvent.type(screen.getByLabelText('Ресурс'), 'Appointment/123');
    await userEvent.type(screen.getByLabelText('Пользователь'), 'PractitionerRole/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() =>
      expect(auditPaths()).toContain('/api/v1/admin/audit?from=2026-10-01&to=2026-10-16&entity=Appointment%2F123&userId=PractitionerRole%2Fabc&page=1&pageSize=20'),
    );
  });

  it('should keep the filters and ask for the next page when the pager moves', async () => {
    renderWithClient(<AuditPanel />);
    await screen.findByText('Найдено событий: 41');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(auditPaths().some((path) => path.includes('page=2&pageSize=20'))).toBe(true));
  });

  it('should refuse a malformed resource and send nothing when the filter is applied', async () => {
    renderWithClient(<AuditPanel />);
    await screen.findByText('Найдено событий: 41');
    const calls = apiFetchMock.mock.calls.length;

    await userEvent.type(screen.getByLabelText('Ресурс'), 'appointment');
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(await screen.findByText('Укажите тип ресурса с заглавной буквы или Тип/id')).toBeInTheDocument();
    expect(screen.getByLabelText('Ресурс')).toHaveFocus();
    expect(apiFetchMock.mock.calls).toHaveLength(calls);
  });

  it('should refuse a period over 366 days when the filter is applied', async () => {
    renderWithClient(<AuditPanel />);
    await screen.findByText('Найдено событий: 41');

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2024-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(await screen.findByText('Период не может превышать 366 дней')).toBeInTheDocument();
    expect(screen.getByLabelText('С')).toHaveFocus();
  });

  it('should restore the default period and clear the text filters when «Сбросить» is pressed', async () => {
    renderWithClient(<AuditPanel />);
    await screen.findByText('Найдено событий: 41');
    await userEvent.type(screen.getByLabelText('Ресурс'), 'Patient');
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(screen.getByLabelText('Ресурс')).toHaveValue('');
    const { from, to } = defaultAuditFilter();
    await waitFor(() => expect(auditPaths().at(-1)).toBe(`/api/v1/admin/audit?from=${from}&to=${to}&page=1&pageSize=20`));
  });

  it('should show the problem with a retry when the journal cannot be loaded', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 400, errorCode: 'VALIDATION_ERROR', detail: 'Invalid date range' }));
    renderWithClient(<AuditPanel />);

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should show the empty state when no event matches', async () => {
    apiFetchMock.mockResolvedValue(pageOf([]));
    renderWithClient(<AuditPanel />);

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('События не найдены');
  });
});
