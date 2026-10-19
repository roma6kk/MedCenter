import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { pageOf, renderWithClient } from '../shared/test-utils';
import type { AdminSchedule } from './schedule-types';
import { SchedulesPanel } from './schedules-panel';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const active: AdminSchedule = {
  id: '2572',
  isActive: true,
  practitionerRoleId: 'role-1',
  roomId: 'room-1',
  serviceId: 'svc-1',
  horizonFrom: '2026-10-16',
  horizonTo: '2026-11-15',
  slotDurationMin: 25,
  windows: [{ dayOfWeek: 'SU', startTime: '22:00', endTime: '23:00' }],
};

const inactive: AdminSchedule = { id: '1812', isActive: false, roomId: '1811', windows: [] };

function answer(schedules: ReadonlyArray<AdminSchedule>): (path: string) => Promise<unknown> {
  return (path) => {
    if (path.startsWith('/api/v1/admin/users')) return Promise.resolve(pageOf([{ id: 'u1', name: 'Иванова Мария', email: 'i@x.test', firstName: 'М', lastName: 'И', roles: ['DOCTOR'], patientRef: null, practitionerRoleRef: 'PractitionerRole/role-1', isActive: true, role: 'DOCTOR' }]));
    if (path.startsWith('/api/v1/rooms')) return Promise.resolve(pageOf([{ id: 'room-1', identifier: '101', name: 'Кабинет 101', isActive: true }]));
    if (path.startsWith('/api/v1/services')) return Promise.resolve(pageOf([{ id: 'svc-1', name: 'Приём терапевта', typeSystem: 's', typeCode: 'c', defaultDurationMin: 25, isActive: true }]));
    if (path.startsWith('/api/v1/admin/schedules')) return Promise.resolve(pageOf(schedules));
    return Promise.resolve(undefined);
  };
}

async function first(name: string): Promise<HTMLElement> {
  return (await screen.findAllByRole('button', { name }))[0] as HTMLElement;
}

describe('SchedulesPanel', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should list only the active schedules first, from GET /api/v1/admin/schedules, when the panel mounts', async () => {
    apiFetchMock.mockImplementation(answer([active]));
    renderWithClient(<SchedulesPanel />);

    expect((await screen.findAllByText('Иванова Мария')).length).toBeGreaterThan(0);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules?page=1&pageSize=10&active=true');
  });

  it('should name the doctor, the room and the service of a schedule and summarize its windows when the list loads', async () => {
    apiFetchMock.mockImplementation(answer([active]));
    renderWithClient(<SchedulesPanel />);

    expect((await screen.findAllByText('Кабинет 101 (101)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Приём терапевта').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Вс 22:00–23:00').length).toBeGreaterThan(0);
  });

  it('should ask for the doctor id when a doctor is chosen in the filter', async () => {
    apiFetchMock.mockImplementation(answer([active]));
    renderWithClient(<SchedulesPanel />);
    await screen.findAllByText('Кабинет 101 (101)');

    await userEvent.selectOptions(screen.getByLabelText('Врач'), 'role-1');

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules?page=1&pageSize=10&doctorId=role-1&active=true'));
  });

  it('should show the inactive leftovers when the status filter is switched to inactive and give them no edit or generate action', async () => {
    apiFetchMock.mockImplementation(answer([inactive]));
    renderWithClient(<SchedulesPanel />);
    await screen.findAllByText('1811');

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'false');

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules?page=1&pageSize=10&active=false'));
    expect(screen.queryByRole('button', { name: /Сгенерировать слоты/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить расписание/ })).not.toBeInTheDocument();
  });

  it('should open the generation dialog of the chosen schedule with its real id when the action is pressed', async () => {
    apiFetchMock.mockImplementation(answer([active]));
    renderWithClient(<SchedulesPanel />);

    await userEvent.click(await first('Сгенерировать слоты: Иванова Мария · Кабинет 101 (101)'));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Генерация слотов' })).getByRole('button', { name: 'Сгенерировать' }));

    await waitFor(() => expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/v1/admin/schedules/2572/generate')).toBe(true));
  });

  it('should open the slot grid of the chosen schedule when the action is pressed', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/slots') ? Promise.resolve([]) : answer([active])(path)));
    renderWithClient(<SchedulesPanel />);

    await userEvent.click(await first('Слоты расписания: Иванова Мария · Кабинет 101 (101)'));

    expect(await screen.findByRole('dialog', { name: 'Слоты расписания' })).toBeInTheDocument();
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([path]) => path.startsWith('/api/v1/admin/schedules/2572/slots?'))).toBe(true));
  });

  it('should show the empty state when no schedule matches', async () => {
    apiFetchMock.mockImplementation(answer([]));
    renderWithClient(<SchedulesPanel />);

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Расписаний нет');
  });

  it('should say that the filters leave nothing when a doctor is chosen and no schedule matches', async () => {
    apiFetchMock.mockImplementation((path) => (path.startsWith('/api/v1/admin/schedules') && path.includes('doctorId=') ? Promise.resolve(pageOf([])) : answer([active])(path)));
    renderWithClient(<SchedulesPanel />);
    await screen.findAllByText('Кабинет 101 (101)');

    await userEvent.selectOptions(screen.getByLabelText('Врач'), 'role-1');

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('По выбранным фильтрам расписаний нет');
  });

  it('should invite to create the first schedule when nothing is filtered and the list is empty', async () => {
    apiFetchMock.mockImplementation(answer([]));
    renderWithClient(<SchedulesPanel />);

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Расписаний нет');
    expect(screen.getByTestId('empty-state')).not.toHaveTextContent('фильтрам');
  });

  it('should name the doctor of a schedule by his name with a mark when his account is disabled', async () => {
    apiFetchMock.mockImplementation((path) =>
      path.startsWith('/api/v1/admin/users')
        ? Promise.resolve(pageOf([{ id: 'u1', name: 'Иванова Мария', email: 'i@x.test', firstName: 'М', lastName: 'И', roles: ['DOCTOR'], patientRef: null, practitionerRoleRef: 'PractitionerRole/role-1', isActive: false, role: 'DOCTOR' }]))
        : answer([active])(path),
    );
    renderWithClient(<SchedulesPanel />);

    expect((await screen.findAllByText('Иванова Мария (учётная запись отключена)')).length).toBeGreaterThan(0);
    expect(screen.queryByText('role-1')).not.toBeInTheDocument();
  });
});
