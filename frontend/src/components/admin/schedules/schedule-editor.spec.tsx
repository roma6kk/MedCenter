import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { ScheduleEditor } from './schedule-editor';
import type { AdminSchedule } from './schedule-types';
import type { SchedulePickers } from './use-schedule-pickers';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const pickers: SchedulePickers = {
  doctors: [{ value: 'role-1', label: 'Иванова Мария' }, { value: 'role-2', label: 'Козлов Дмитрий' }],
  allDoctors: [{ value: 'role-1', label: 'Иванова Мария' }, { value: 'role-2', label: 'Козлов Дмитрий' }],
  rooms: [{ value: 'room-1', label: 'Кабинет 101 (101)' }],
  services: [{ value: 'svc-1', label: 'Приём терапевта', durationMin: 20 }],
  isTruncated: false,
  isPending: false,
  error: null,
};

const existing: AdminSchedule = {
  id: '77',
  isActive: true,
  practitionerRoleId: 'role-1',
  roomId: 'room-1',
  serviceId: 'svc-1',
  horizonFrom: '2026-10-16',
  horizonTo: '2026-11-15',
  slotDurationMin: 30,
  windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }],
};

function setTime(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function chooseActors(): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText(/Врач/), 'role-1');
  await userEvent.selectOptions(screen.getByLabelText(/Кабинет/), 'room-1');
  await userEvent.selectOptions(screen.getByLabelText(/Услуга/), 'svc-1');
}

function renderCreate(onDone: () => void = jest.fn()): void {
  renderWithClient(<ScheduleEditor pickers={pickers} onDone={onDone} onCancel={jest.fn()} />);
}

describe('ScheduleEditor (create)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should offer the doctors, rooms and services of the pickers when the editor opens', () => {
    renderCreate();

    expect(screen.getByRole('option', { name: 'Козлов Дмитрий' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Кабинет 101 (101)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Приём терапевта' })).toBeInTheDocument();
  });

  it('should follow the default duration of the chosen service when the admin has not typed a duration', async () => {
    renderCreate();

    await userEvent.selectOptions(screen.getByLabelText(/Услуга/), 'svc-1');

    expect(screen.getByLabelText(/Длительность слота/)).toHaveValue(20);
  });

  it('should keep the duration the admin typed when a service is chosen afterwards', async () => {
    renderCreate();
    await userEvent.clear(screen.getByLabelText(/Длительность слота/));
    await userEvent.type(screen.getByLabelText(/Длительность слота/), '45');

    await userEvent.selectOptions(screen.getByLabelText(/Услуга/), 'svc-1');

    expect(screen.getByLabelText(/Длительность слота/)).toHaveValue(45);
  });

  it('should ask for the three actors and send nothing when they are not chosen', async () => {
    renderCreate();

    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    expect(await screen.findByText('Выберите врача')).toBeInTheDocument();
    expect(screen.getByText('Выберите кабинет')).toBeInTheDocument();
    expect(screen.getByText('Выберите услугу')).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should post CreateScheduleDto with the chosen actors, the horizon, the windows and the duration when the form is valid', async () => {
    apiFetchMock.mockResolvedValue(existing);
    const onDone = jest.fn();
    renderCreate(onDone);
    await chooseActors();
    setTime('Начало, окно 1', '10:00');
    setTime('Окончание, окно 1', '12:30');

    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/admin/schedules');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      practitionerRoleId: 'role-1',
      roomId: 'room-1',
      serviceId: 'svc-1',
      windows: [{ dayOfWeek: 'MO', startTime: '10:00', endTime: '12:30' }],
      slotDurationMin: 20,
    });
  });

  it('should mark a window when it overlaps another one of the same weekday, before anything is sent', async () => {
    renderCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить окно' }));
    setTime('Начало, окно 2', '12:00');
    setTime('Окончание, окно 2', '15:00');

    expect(screen.getByTestId('window-row-0')).toHaveAttribute('data-overlap', 'true');
    expect(screen.getByTestId('window-row-1')).toHaveAttribute('data-overlap', 'true');
    expect(screen.getAllByText('Окно пересекается с другим окном этого дня')).toHaveLength(2);
  });

  it('should not send a schedule when its windows overlap', async () => {
    renderCreate();
    await chooseActors();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить окно' }));
    setTime('Начало, окно 2', '12:00');
    setTime('Окончание, окно 2', '15:00');

    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    expect(await screen.findByText('Окна одного дня пересекаются')).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should highlight the windows and explain SCHEDULE_OVERLAP when the server finds another schedule of the doctor', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'SCHEDULE_OVERLAP', detail: 'SCHEDULE_OVERLAP: practitioner role role-1 already has a schedule in this period' }));
    renderCreate();
    await chooseActors();

    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Расписание пересекается с другим расписанием этого врача');
    expect(screen.getByRole('alert')).toHaveTextContent('У врача уже есть расписание');
    expect(screen.getByTestId('window-row-0')).toHaveAttribute('data-overlap', 'true');
  });

  it('should say in words and tie to the time fields which windows may overlap when the server answers SCHEDULE_OVERLAP', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'SCHEDULE_OVERLAP', detail: 'SCHEDULE_OVERLAP: practitioner role role-1 already has a schedule in this period' }));
    renderCreate();
    await chooseActors();

    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Начало, окно 1')).toHaveAccessibleDescription('Возможно, пересекается с другим расписанием врача');
    expect(screen.getByLabelText('Окончание, окно 1')).toHaveAccessibleDescription('Возможно, пересекается с другим расписанием врача');
  });

  it('should drop the overlap marks and the banner when a new submit fails the check', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'SCHEDULE_OVERLAP', detail: 'SCHEDULE_OVERLAP: practitioner role role-1 already has a schedule in this period' }));
    renderCreate();
    await chooseActors();
    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));
    await screen.findByRole('alert');

    await userEvent.selectOptions(screen.getByLabelText('Врач *'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Создать расписание' }));

    expect(await screen.findByText('Выберите врача')).toBeInTheDocument();
    expect(screen.getByTestId('window-row-0')).toHaveAttribute('data-overlap', 'false');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should not let the admin remove the window when it is the only one', () => {
    renderCreate();

    expect(screen.getByRole('button', { name: 'Удалить окно 1' })).toBeDisabled();
  });

  it('should show the week at a glance with the window on its weekday when the editor opens', () => {
    renderCreate();

    expect(screen.getByRole('group', { name: 'Неделя целиком' })).toHaveTextContent('09:00–13:00');
  });
});

describe('ScheduleEditor (edit)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should show the actors as text and patch only horizon, windows and duration when a schedule is edited', async () => {
    apiFetchMock.mockResolvedValue(existing);
    const onDone = jest.fn();
    renderWithClient(<ScheduleEditor schedule={existing} pickers={pickers} onDone={onDone} onCancel={jest.fn()} />);
    expect(screen.getByText('Иванова Мария')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Врач/)).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Длительность слота/));
    await userEvent.type(screen.getByLabelText(/Длительность слота/), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/admin/schedules/77');
    expect(options?.method).toBe('PATCH');
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ slotDurationMin: 15, horizonFrom: '2026-10-16' });
    expect(body).not.toHaveProperty('practitionerRoleId');
  });

  it('should send the emptied comment so that the server drops the old text when the comment is cleared on edit', async () => {
    apiFetchMock.mockResolvedValue(existing);
    renderWithClient(<ScheduleEditor schedule={{ ...existing, comment: 'старый' }} pickers={pickers} onDone={jest.fn()} onCancel={jest.fn()} />);

    await userEvent.clear(screen.getByLabelText('Комментарий'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(apiFetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ comment: '', horizonFrom: '2026-10-16' });
  });
});
