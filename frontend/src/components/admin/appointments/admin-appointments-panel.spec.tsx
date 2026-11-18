jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { apiFetch } from '@/lib/api/api-fetch';
import { renderWithClient } from '../shared/test-utils';
import { AdminAppointmentsPanel } from './admin-appointments-panel';
import { defaultAdminAppointmentFilter } from './admin-appointment-filter';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const booked = appointmentFixture({ id: 'a1', patientName: 'Лебедева Анна' });
const cancelled = appointmentFixture({ id: 'a2', status: 'cancelled', cancelReason: 'other', patientName: 'Орлов Пётр' });
const doctor = { id: 'u1', name: 'Иванова Мария', email: 'x@y.test', firstName: 'Мария', lastName: 'Иванова', roles: ['DOCTOR'], role: 'DOCTOR', patientRef: null, practitionerRoleRef: 'PractitionerRole/role-1', isActive: true };

function listPaths(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/api/v1/admin/appointments'));
}

describe('AdminAppointmentsPanel', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/admin/appointments');
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/v1/admin/users')) return Promise.resolve({ items: [doctor], meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } });
      if (path.startsWith('/api/v1/admin/appointments')) return Promise.resolve({ items: [booked, cancelled], meta: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } });
      return Promise.resolve({});
    });
  });

  it('should list the next 30 days with who, which doctor and the status', async () => {
    renderWithClient(<AdminAppointmentsPanel />);
    const { from, to } = defaultAdminAppointmentFilter();

    const table = within(await screen.findByRole('table', { name: 'Записи' }));

    expect(table.getByText('Лебедева Анна')).toBeInTheDocument();
    expect(table.getAllByText('Иванова Мария Сергеевна')).toHaveLength(2);
    expect(table.getByTestId('stamp-cancelled')).toBeInTheDocument();
    expect(listPaths()).toContain(`/api/v1/admin/appointments?from=${from}&to=${to}&page=1&pageSize=20&sortOrder=asc`);
  });

  it('should offer «Отменить» only on a booked appointment', async () => {
    renderWithClient(<AdminAppointmentsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Записи' }));

    expect(table.getAllByRole('button', { name: /^Отменить запись:/ })).toHaveLength(1);
  });

  it('should read the doctor and the status from the address and send them', async () => {
    window.history.replaceState(null, '', '/admin/appointments?from=2026-11-02&to=2026-11-09&doctor=role-1&status=booked');
    renderWithClient(<AdminAppointmentsPanel />);

    await screen.findByRole('table', { name: 'Записи' });

    expect(listPaths()[0]).toBe('/api/v1/admin/appointments?from=2026-11-02&to=2026-11-09&practitionerRoleId=role-1&status=booked&page=1&pageSize=20&sortOrder=asc');
  });

  it('should keep the chosen doctor in the address and ask for it', async () => {
    renderWithClient(<AdminAppointmentsPanel />);
    await screen.findByRole('table', { name: 'Записи' });

    await userEvent.selectOptions(screen.getByLabelText('Врач'), 'Иванова Мария');

    await waitFor(() => expect(listPaths().at(-1)).toContain('practitionerRoleId=role-1'));
    expect(window.location.search).toBe('?doctor=role-1');
  });

  it('should cancel with a reason code through the same cancel call as the patient and read the list again', async () => {
    renderWithClient(<AdminAppointmentsPanel />);
    const table = within(await screen.findByRole('table', { name: 'Записи' }));
    await userEvent.click(table.getByRole('button', { name: /^Отменить запись:/ }));
    const dialog = within(screen.getByRole('dialog'));

    await userEvent.click(dialog.getByRole('radio', { name: 'Другое' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Подтвердить отмену' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments/a1/cancel', { method: 'POST', body: JSON.stringify({ reason: 'other' }) }));
    await waitFor(() => expect(listPaths().length).toBeGreaterThan(1));
  });

  it('should say nothing was found when the filters leave no appointment', async () => {
    window.history.replaceState(null, '', '/admin/appointments?status=noshow');
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.startsWith('/api/v1/admin/appointments') ? { items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } } : { items: [], meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } }));
    renderWithClient(<AdminAppointmentsPanel />);

    expect(await screen.findByText('Записи не найдены')).toBeInTheDocument();
  });
});
