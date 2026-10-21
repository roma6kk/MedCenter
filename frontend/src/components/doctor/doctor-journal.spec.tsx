jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';
import { DoctorJournal } from './doctor-journal';
import { appointment, callsTo, pageOf, problem, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';

const apiFetchMock = apiFetch as ApiMock;
const JOURNAL = '/api/v1/doctor/appointments';
const TODAY: string = clinicDateKey();

const ROWS = [
  appointment({ id: 'a1', start: '2026-10-20T06:00:00Z', patientName: 'Кузнецов Алексей', status: 'booked' }),
  appointment({ id: 'a2', start: '2026-10-20T06:30:00Z', patientId: 'p2', patientName: 'Лебедева Ирина', status: 'noshow' }),
  appointment({ id: 'a3', start: '2026-10-20T07:00:00Z', patientId: 'p3', patientName: 'Новиков Пётр', status: 'fulfilled' }),
  appointment({ id: 'a4', start: '2026-10-20T07:30:00Z', patientId: 'p4', patientName: undefined, status: 'cancelled' }),
];

function setup(respond: () => unknown = () => pageOf(ROWS)): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [{ path: JOURNAL, respond }]);
  renderWithClient(<DoctorJournal />);
}

/** The desktop table: `PaginatedTable` also renders the same rows as mobile cards (hidden by CSS only). */
async function findTable(): Promise<HTMLElement> {
  return screen.findByRole('table');
}

function lastJournalPath(): string {
  return callsTo(apiFetchMock, JOURNAL).at(-1)?.[0] ?? '';
}

describe('DoctorJournal', () => {
  beforeEach(() => window.history.replaceState(null, '', '/doctor/appointments'));

  it('should request the clinic day as from and to instead of the unsupported date parameter', async () => {
    setup();

    await findTable();

    const query = new URL(lastJournalPath(), 'http://x').searchParams;
    expect(query.get('from')).toBe(`${TODAY}T00:00:00+03:00`);
    expect(query.get('to')).toBe(`${TODAY}T23:59:59+03:00`);
    expect(query.has('date')).toBe(false);
  });

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

  it('should show the Minsk time of each visit with the patient and the booked service', async () => {
    setup();

    const row = within(await findTable()).getByText('Кузнецов Алексей').closest('tr');

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('09:00')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Консультация терапевта')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Боль в горле')).toBeInTheDocument();
  });

  it('should link the patient name to the patient card', async () => {
    setup();

    expect(within(await findTable()).getByRole('link', { name: 'Кузнецов Алексей' })).toHaveAttribute('href', '/patients/p1');
  });

  it('should offer opening and no-show only for the booked visit (BR-008)', async () => {
    setup();
    const table = within(await findTable());

    expect(table.getAllByRole('button', { name: /Открыть приём/ })).toHaveLength(1);
    expect(table.getAllByRole('button', { name: /Отметить неявку/ })).toHaveLength(1);
  });

  it('should fall back to the patient id when the service sent no name', async () => {
    setup();

    expect(within(await findTable()).getByRole('link', { name: 'Пациент p4' })).toBeInTheDocument();
  });

  it('should say so when the day has no appointments', async () => {
    setup(() => pageOf([]));

    expect(await screen.findByText('На этот день записей нет')).toBeInTheDocument();
  });

  it('should hide the rows of other statuses when a status is chosen', async () => {
    setup();
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'noshow');

    const table = within(screen.getByRole('table'));
    expect(table.queryByText('Кузнецов Алексей')).toBeNull();
    expect(table.getByText('Лебедева Ирина')).toBeInTheDocument();
  });

  it('should tell that nothing matches when the chosen status has no rows', async () => {
    setup(() => pageOf([ROWS[0] as ReturnType<typeof appointment>]));
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'cancelled');

    expect(screen.getByText('Нет записей с выбранным статусом')).toBeInTheDocument();
  });

  it('should load the next day when the next-day button is pressed', async () => {
    setup();
    await findTable();

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));

    const tomorrow: string = shiftDateKey(TODAY, 1);
    await screen.findByText(/Записей на день/);
    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe(`${tomorrow}T00:00:00+03:00`);
  });

  it('should load the previous day and enable the today button when the previous-day button is pressed', async () => {
    setup();
    await findTable();
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий день' }));

    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe(`${shiftDateKey(TODAY, -1)}T00:00:00+03:00`);
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('should keep keyboard focus on the today button when it is activated', async () => {
    window.history.replaceState(null, '', `/doctor/appointments?date=${shiftDateKey(TODAY, -2)}`);
    setup();
    await findTable();
    const today = screen.getByRole('button', { name: 'Сегодня' });
    today.focus();

    await userEvent.keyboard('{Enter}');

    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe(`${TODAY}T00:00:00+03:00`);
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute('aria-disabled', 'true');
    window.history.replaceState(null, '', '/');
  });

  it('should ignore the today button when the journal already shows today', async () => {
    setup();
    await findTable();
    const before: number = callsTo(apiFetchMock, JOURNAL).length;

    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));

    expect(callsTo(apiFetchMock, JOURNAL)).toHaveLength(before);
    expect(window.location.search).toBe('');
  });

  it('should show the error with a retry button when the journal cannot be loaded', async () => {
    setup(() => { throw problem(500, 'INTERNAL'); });

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should show the count of the day from the server meta', async () => {
    setup();

    expect(await screen.findByText('Записей на день: 4')).toBeInTheDocument();
  });

  it('should warn that the status filter covers only the shown page when the day has several pages', async () => {
    setup(() => pageOf(ROWS, 1, 2));
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'noshow');

    expect(screen.getByText(/Фильтр применён только к странице 1 из 2/)).toBeInTheDocument();
  });

  it('should not warn about the filter when the whole day is on one page', async () => {
    setup();
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'noshow');

    expect(screen.queryByText(/Фильтр применён только/)).toBeNull();
  });

  it('should ask for up to 50 appointments of the day at once', async () => {
    setup();
    await findTable();

    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('pageSize')).toBe('50');
  });

  it('should start on the day given in the address bar when it is a real date', async () => {
    window.history.replaceState(null, '', '/doctor/appointments?date=2026-10-19');
    setup();

    await findTable();

    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe('2026-10-19T00:00:00+03:00');
    window.history.replaceState(null, '', '/');
  });

  it('should fall back to today when the day in the address bar is not a date', async () => {
    window.history.replaceState(null, '', '/doctor/appointments?date=soon');
    setup();

    await findTable();

    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe(`${TODAY}T00:00:00+03:00`);
    window.history.replaceState(null, '', '/');
  });

  it('should write the chosen day into the address bar when the day changes', async () => {
    window.history.replaceState(null, '', '/doctor/appointments');
    setup();
    await findTable();

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));

    expect(window.location.search).toBe(`?date=${shiftDateKey(TODAY, 1)}`);
    window.history.replaceState(null, '', '/');
  });

  it('should follow the address bar when a navigation drops the day while the journal stays mounted', async () => {
    window.history.replaceState(null, '', '/doctor/appointments?date=2026-10-19');
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [{ path: JOURNAL, respond: () => pageOf(ROWS) }]);
    const { rerender } = renderWithClient(<DoctorJournal />);
    await findTable();
    expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe('2026-10-19T00:00:00+03:00');

    // The shell's "Журнал" link: same route, no `?date=`, the component is not remounted.
    window.history.replaceState(null, '', '/doctor/appointments');
    rerender(<DoctorJournal />);

    await waitFor(() => expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe(`${TODAY}T00:00:00+03:00`));
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');
    window.history.replaceState(null, '', '/');
  });

  it('should return to page 1 when the day changes while a later page is open', async () => {
    setup(() => pageOf(ROWS, 1, 3));
    await findTable();
    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    await waitFor(() => expect(new URL(lastJournalPath(), 'http://x').searchParams.get('page')).toBe('2'));

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));

    await waitFor(() => expect(new URL(lastJournalPath(), 'http://x').searchParams.get('page')).toBe('1'));
  });

  it('should move a journal that follows today to the new day when midnight passes in Minsk', async () => {
    // 2026-10-20 23:59:30 in Minsk (UTC+3).
    jest.useFakeTimers({ now: new Date('2026-10-20T20:59:30Z'), advanceTimers: true });
    try {
      setup();
      await findTable();
      expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe('2026-10-20T00:00:00+03:00');

      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      await waitFor(() => expect(new URL(lastJournalPath(), 'http://x').searchParams.get('from')).toBe('2026-10-21T00:00:00+03:00'));
      expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');
    } finally {
      jest.useRealTimers();
    }
  });
});
