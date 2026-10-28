jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';
import { DoctorScheduleView } from './doctor-schedule-view';
import { appointment, callsTo, pageOf, problem, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';
import type { DoctorScheduleResponse, JournalAppointment, ScheduleSlot } from './doctor-types';
import { weekDaysOf, weekStartOf } from './schedule-week-model';

const apiFetchMock = apiFetch as ApiMock;
const SCHEDULE = '/api/v1/doctor/schedule';
const JOURNAL = '/api/v1/doctor/appointments';
const TODAY: string = clinicDateKey();
const WEEK: ReadonlyArray<string> = weekDaysOf(weekStartOf(TODAY));
const MONDAY: string = WEEK[0] as string;
const TUESDAY: string = WEEK[1] as string;

/** 06:00Z is 09:00 in Minsk, whatever the date. */
function slot(id: string, day: string, time: string, status: ScheduleSlot['status']): ScheduleSlot {
  return { id, scheduleId: 'sch-1', start: `${day}T${time}:00Z`, end: `${day}T${time}:00Z`, status, label: `${day} ${status}` };
}

const RESPONSE: DoctorScheduleResponse = {
  practitionerRoleId: 'role-1',
  from: MONDAY,
  to: WEEK[6] as string,
  schedules: [
    {
      id: 'sch-1',
      isActive: true,
      roomId: 'room-204',
      serviceId: 'srv-1',
      slotDurationMin: 30,
      horizonFrom: '2026-10-01',
      horizonTo: '2026-12-30',
      comment: 'Приём терапевта, Кабинет 204: MO/TU 09:00-13:00 (время клиники, Минск)',
      windows: [
        { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' },
        { dayOfWeek: 'TU', startTime: '09:00', endTime: '13:00' },
      ],
    },
  ],
  items: [
    slot('s1', MONDAY, '06:00', 'free'),
    slot('s2', MONDAY, '06:30', 'busy'),
    slot('s3', TUESDAY, '06:00', 'free'),
    slot('s4', TUESDAY, '06:30', 'busy'),
  ],
};

const VISIT: JournalAppointment = appointment({ id: 'v1', slotId: 's2', patientId: 'p-77', patientName: 'Кузнецов Павел', serviceName: 'Приём терапевта' });

interface Setup {
  readonly schedule?: () => unknown;
  readonly visits?: ReadonlyArray<JournalAppointment>;
}

function setup({ schedule = () => RESPONSE, visits = [VISIT] }: Setup = {}): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [
    { path: SCHEDULE, respond: schedule },
    { path: JOURNAL, respond: () => pageOf(visits) },
    { path: '/api/v1/rooms', respond: () => pageOf([{ id: 'room-204', identifier: '204', name: 'Кабинет 204', isActive: true }]) },
    { path: '/api/v1/services', respond: () => pageOf([{ id: 'srv-1', name: 'Приём терапевта', typeSystem: 's', typeCode: 'c', defaultDurationMin: 30, isActive: true }]) },
  ]);
  renderWithClient(<DoctorScheduleView />);
}

function queryOf(path: string): URLSearchParams {
  return new URL(path, 'http://x').searchParams;
}

describe('DoctorScheduleView', () => {
  it('should request the calendar week that holds today, Monday to Sunday, and the visits of the same week', async () => {
    setup();

    await screen.findByRole('table');

    const query = queryOf(callsTo(apiFetchMock, SCHEDULE)[0]?.[0] ?? '');
    expect(query.get('from')).toBe(MONDAY);
    expect(query.get('to')).toBe(WEEK[6]);
    expect(queryOf(callsTo(apiFetchMock, JOURNAL)[0]?.[0] ?? '').get('from')).toContain(MONDAY);
  });

  it('should say the working windows in words with the room once, not as RRULE text or a table of seven days', async () => {
    setup();

    const windows = within(await screen.findByRole('region', { name: 'Рабочие окна' }));

    expect(await windows.findByText('Пн, Вт, 09:00–13:00 · Кабинет 204')).toBeInTheDocument();
    expect(windows.getByText(/Приём терапевта/)).toHaveTextContent('Приём терапевта · Слот 30 мин · до');
    expect(document.body).not.toHaveTextContent('MO/TU');
    expect(screen.queryByRole('table', { name: 'Рабочие окна по дням недели' })).not.toBeInTheDocument();
  });

  it('should draw the week as a table with a column per day, quiet cells for free slots and a block with the patient for a busy one', async () => {
    setup();

    const table = within(await screen.findByRole('table', { name: /Слоты недели/ }));

    expect(table.getAllByRole('columnheader')).toHaveLength(7);
    expect(table.getAllByRole('rowheader').map((row) => row.textContent)).toEqual(['09:00', '09:30']);
    const patient = await table.findByRole('link', { name: /Кузнецов Павел/ });
    expect(patient).toHaveAttribute('href', '/patients/p-77');
    expect(patient).toHaveTextContent('Кузнецов П.');
    expect(table.getAllByText(/09:00.*Свободно/)).toHaveLength(2);
  });

  it('should show only «Занято» for a busy slot the journal does not list', async () => {
    setup({ visits: [] });

    const table = within(await screen.findByRole('table', { name: /Слоты недели/ }));

    expect(await table.findAllByText('Занято')).toHaveLength(2);
    expect(table.queryByRole('link')).not.toBeInTheDocument();
  });

  it('should show the load of each day as «занято N из M» with a small bar', async () => {
    setup();

    const bars = await screen.findAllByRole('progressbar', { name: 'занято 1 из 2' });

    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '1');
    expect(bars[0]).toHaveAttribute('aria-valuemax', '2');
  });

  it('should warn when the service cut the slot list short or the visits do not fit one page', async () => {
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [
      { path: SCHEDULE, respond: () => ({ ...RESPONSE, truncated: true }) },
      { path: JOURNAL, respond: () => pageOf([VISIT], 1, 2) },
      { path: '/api/v1/rooms', respond: () => pageOf([]) },
      { path: '/api/v1/services', respond: () => pageOf([]) },
    ]);
    renderWithClient(<DoctorScheduleView />);

    expect(await screen.findByText(/Показаны не все слоты/)).toBeInTheDocument();
    expect(await screen.findByText(/Показаны не все записи недели/)).toBeInTheDocument();
  });

  it('should say there are no slots when the week has none', async () => {
    setup({ schedule: () => ({ ...RESPONSE, items: [] }) });

    expect(await screen.findByText('На этой неделе слотов нет')).toBeInTheDocument();
  });

  it('should explain that the schedule is created by an administrator when the doctor has none', async () => {
    setup({ schedule: () => ({ ...RESPONSE, schedules: [], items: [] }) });

    expect(await screen.findByText('Расписание не найдено')).toBeInTheDocument();
    expect(screen.getByText(/создаёт администратор/)).toBeInTheDocument();
  });

  it('should move by a whole week when the next-week button is pressed', async () => {
    setup();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));

    await waitFor(() => expect(queryOf(callsTo(apiFetchMock, SCHEDULE).at(-1)?.[0] ?? '').get('from')).toBe(shiftDateKey(MONDAY, 7)));
    expect(queryOf(callsTo(apiFetchMock, SCHEDULE).at(-1)?.[0] ?? '').get('to')).toBe(shiftDateKey(MONDAY, 13));
  });

  it('should show the error with a retry button when the schedule cannot be loaded', async () => {
    setup({ schedule: () => { throw problem(500, 'INTERNAL'); } });

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should keep keyboard focus on the today button when it brings the calendar back to this week', async () => {
    setup();
    await screen.findByRole('table');
    const today = screen.getByRole('button', { name: 'Сегодня' });
    expect(today).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
    await waitFor(() => expect(today).toHaveAttribute('aria-disabled', 'false'));
    today.focus();

    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(today).toHaveAttribute('aria-disabled', 'true'));
    expect(today).toHaveFocus();
  });

  it('should not reload the schedule when the today button is pressed on this week', async () => {
    setup();
    await screen.findByRole('table');
    const before: number = callsTo(apiFetchMock, SCHEDULE).length;

    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));

    expect(callsTo(apiFetchMock, SCHEDULE)).toHaveLength(before);
  });
});

describe('DoctorScheduleView on a phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('should show one day at a time with a strip of the days of the week instead of the table', async () => {
    setup();

    const strip = await screen.findByRole('radiogroup', { name: 'День недели' });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(strip).getAllByRole('radio')).toHaveLength(7);
  });

  it('should list the slots of the chosen day with the patient in the busy one and switch day with the strip', async () => {
    setup();
    const strip = within(await screen.findByRole('radiogroup', { name: 'День недели' }));
    await userEvent.click(strip.getByTestId(`slot-day-chip-${MONDAY}`));

    expect(await screen.findByRole('link', { name: /Кузнецов Павел/ })).toHaveAttribute('href', '/patients/p-77');
    expect(screen.getByText('занято 1 из 2')).toBeInTheDocument();
  });
});
