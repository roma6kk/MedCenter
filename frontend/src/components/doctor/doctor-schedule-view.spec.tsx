jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { minskDateKey } from '@/lib/utils';
import { formatDateKey, shiftDateKey } from './clinic-time';
import { DoctorScheduleView, SCHEDULE_DAYS } from './doctor-schedule-view';
import { callsTo, problem, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';
import type { DoctorScheduleResponse, ScheduleSlot } from './doctor-types';

const apiFetchMock = apiFetch as ApiMock;
const SCHEDULE = '/api/v1/doctor/schedule';
const TODAY: string = minskDateKey();

function slot(id: string, start: string, end: string, status: ScheduleSlot['status']): ScheduleSlot {
  return { id, scheduleId: 'sch-1', start, end, status, label: `${start} ${status}` };
}

const RESPONSE: DoctorScheduleResponse = {
  practitionerRoleId: 'role-1',
  from: TODAY,
  to: shiftDateKey(TODAY, SCHEDULE_DAYS - 1),
  schedules: [
    {
      id: 'sch-1',
      isActive: true,
      slotDurationMin: 30,
      horizonFrom: '2026-10-01',
      horizonTo: '2026-12-30',
      comment: 'Кабинет 204',
      windows: [
        { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' },
        { dayOfWeek: 'MO', startTime: '14:00', endTime: '17:00' },
        { dayOfWeek: 'TU', startTime: '09:00', endTime: '13:00' },
      ],
    },
  ],
  items: [
    slot('s1', '2026-10-20T06:00:00Z', '2026-10-20T06:30:00Z', 'free'),
    slot('s2', '2026-10-20T06:30:00Z', '2026-10-20T07:00:00Z', 'busy'),
    slot('s3', '2026-10-21T06:00:00Z', '2026-10-21T06:30:00Z', 'free'),
  ],
};

function setup(respond: () => unknown = () => RESPONSE): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [{ path: SCHEDULE, respond }]);
  renderWithClient(<DoctorScheduleView />);
}

describe('DoctorScheduleView', () => {
  it('should request a 14-day period starting today', async () => {
    setup();

    await screen.findByText('Кабинет 204');

    const query = new URL(callsTo(apiFetchMock, SCHEDULE)[0]?.[0] ?? '', 'http://x').searchParams;
    expect(query.get('from')).toBe(TODAY);
    expect(query.get('to')).toBe(shiftDateKey(TODAY, SCHEDULE_DAYS - 1));
  });

  it('should show the weekly windows of the schedule with a day off for the days without one', async () => {
    setup();

    const table = within(await screen.findByRole('table', { name: 'Рабочие окна по дням недели' }));

    expect(table.getByRole('row', { name: /Понедельник/ })).toHaveTextContent('09:00–13:00, 14:00–17:00');
    expect(table.getByRole('row', { name: /Вторник/ })).toHaveTextContent('09:00–13:00');
    expect(table.getByRole('row', { name: /Среда/ })).toHaveTextContent('выходной');
  });

  it('should show the slot duration and the horizon of the schedule', async () => {
    setup();

    expect(await screen.findByText(/Слот 30 мин/)).toHaveTextContent(`горизонт ${formatDateKey('2026-10-01')} — ${formatDateKey('2026-12-30')}`);
  });

  it('should group the slots by clinic day with the Minsk time and the status stamp', async () => {
    setup();

    const day = within(await screen.findByRole('region', { name: /вторник, 20 октября/i }));

    expect(day.getByText('09:00–09:30')).toBeInTheDocument();
    expect(day.getByText('09:30–10:00')).toBeInTheDocument();
    expect(day.getByTestId('stamp-free')).toBeInTheDocument();
    expect(day.getByTestId('stamp-busy')).toBeInTheDocument();
    expect(day.getByText('занято 1 из 2')).toBeInTheDocument();
  });

  it('should warn when the service cut the slot list short', async () => {
    setup(() => ({ ...RESPONSE, truncated: true }));

    expect(await screen.findByText(/Показаны не все слоты/)).toBeInTheDocument();
  });

  it('should say there are no slots when the period has none', async () => {
    setup(() => ({ ...RESPONSE, items: [] }));

    expect(await screen.findByText('В этом периоде слотов нет')).toBeInTheDocument();
  });

  it('should explain that the schedule is created by an administrator when the doctor has none', async () => {
    setup(() => ({ ...RESPONSE, schedules: [], items: [] }));

    expect(await screen.findByText('Расписание не найдено')).toBeInTheDocument();
    expect(screen.getByText(/создаёт администратор/)).toBeInTheDocument();
  });

  it('should move the period by 14 days when the later button is pressed', async () => {
    setup();
    await screen.findByText('Кабинет 204');

    await userEvent.click(screen.getByRole('button', { name: /Позже/ }));

    await screen.findByText(`Период: ${formatDateKey(shiftDateKey(TODAY, SCHEDULE_DAYS))} — ${formatDateKey(shiftDateKey(TODAY, 2 * SCHEDULE_DAYS - 1))}`);
    expect(new URL(callsTo(apiFetchMock, SCHEDULE).at(-1)?.[0] ?? '', 'http://x').searchParams.get('from')).toBe(shiftDateKey(TODAY, SCHEDULE_DAYS));
  });

  it('should show the error with a retry button when the schedule cannot be loaded', async () => {
    setup(() => { throw problem(500, 'INTERNAL'); });

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should keep keyboard focus on the today button when it brings the period back to today', async () => {
    setup();
    await screen.findByText('Кабинет 204');
    const today = screen.getByRole('button', { name: 'Сегодня' });
    expect(today).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Позже/ }));
    await waitFor(() => expect(today).toHaveAttribute('aria-disabled', 'false'));
    today.focus();

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText(`Период: ${formatDateKey(TODAY)} — ${formatDateKey(shiftDateKey(TODAY, SCHEDULE_DAYS - 1))}`)).toBeInTheDocument();
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute('aria-disabled', 'true');
  });

  it('should not reload the schedule when the today button is pressed on today', async () => {
    setup();
    await screen.findByText('Кабинет 204');
    const before: number = callsTo(apiFetchMock, SCHEDULE).length;

    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));

    expect(callsTo(apiFetchMock, SCHEDULE)).toHaveLength(before);
  });
});
