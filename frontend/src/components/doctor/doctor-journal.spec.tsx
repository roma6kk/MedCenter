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

async function findTable(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Приёмы по времени' });
}

function lastQuery(): URLSearchParams {
  return new URL(callsTo(apiFetchMock, JOURNAL).at(-1)?.[0] ?? '', 'http://x').searchParams;
}

function visit(search: string): void {
  window.history.replaceState(null, '', `/doctor/appointments${search}`);
}

describe('DoctorJournal', () => {
  beforeEach(() => visit(''));
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('should request the clinic day as from and to instead of the unsupported date parameter', async () => {
    setup();

    await findTable();

    const query = lastQuery();
    expect(query.get('from')).toBe(`${TODAY}T00:00:00+03:00`);
    expect(query.get('to')).toBe(`${TODAY}T23:59:59+03:00`);
    expect(query.has('date')).toBe(false);
  });

jest.setTimeout(30_000);

  it('should show the Minsk time of each visit with the patient and the booked service', async () => {
    setup();

    const row = within(await findTable()).getByText('Кузнецов Алексей').closest('li');

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('09:00')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Консультация терапевта')).toBeInTheDocument();
  });

  it('should show the reason of the next patient in the side panel and leave out what the API does not have', async () => {
    setup();

    const panel = within(await screen.findByRole('region', { name: 'Кузнецов Алексей' }));

    expect(panel.getByText('Боль в горле')).toBeInTheDocument();
    expect(panel.getByText('30 мин')).toBeInTheDocument();
    expect(panel.queryByText(/Прошлые визиты|Последний диагноз/)).toBeNull();
  });

  it('should mark the first booked visit as the next patient and strike the cancelled one through', async () => {
    setup();
    const timeline = within(await findTable());

    expect(within(timeline.getByTestId('journal-visit-a1')).getByText('Следующий пациент')).toBeInTheDocument();
    expect(timeline.getByTestId('journal-visit-a4').querySelector('.line-through')).not.toBeNull();
    expect(timeline.getByTestId('journal-visit-a2')).toHaveTextContent('Неявка');
  });

  it('should summarise the day by status', async () => {
    setup();
    await findTable();

    expect(screen.getByRole('img', { name: 'Из 4: ожидает 1, состоялось 1, неявка 1, отменено 1' })).toBeInTheDocument();
  });

  it('should collapse a long pause between two visits into one line', async () => {
    setup(() => pageOf([ROWS[0] as ReturnType<typeof appointment>, appointment({ id: 'late', patientId: 'p9', patientName: 'Орлов Иван', start: '2026-10-20T11:00:00Z', end: '2026-10-20T11:30:00Z' })]));

    expect(await within(await findTable()).findByText('Окно 4 ч 30 мин')).toBeInTheDocument();
  });

  it('should show a pause of half an hour as a quiet «окно» row between two visits (A13)', async () => {
    setup(() =>
      pageOf([
        appointment({ id: 'x1', start: '2026-10-20T06:00:00Z', end: '2026-10-20T06:30:00Z' }),
        appointment({ id: 'x2', patientId: 'p9', patientName: 'Орлов Иван', start: '2026-10-20T07:00:00Z', end: '2026-10-20T07:30:00Z' }),
      ]),
    );

    expect(await within(await findTable()).findByText('Окно 30 мин')).toBeInTheDocument();
  });

  it('should draw the «now» line between the visits behind the doctor and those ahead on today\'s timeline (A13)', async () => {
    const at = (offsetMinutes: number): string => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
    setup(() =>
      pageOf([
        appointment({ id: 'past', start: at(-120), end: at(-90) }),
        appointment({ id: 'ahead', patientId: 'p9', patientName: 'Орлов Иван', start: at(120), end: at(150) }),
      ]),
    );
    const timeline = await findTable();

    const now = await within(timeline).findByTestId('journal-now');

    const order: string[] = Array.from(timeline.querySelectorAll('[data-testid]')).map((node) => node.getAttribute('data-testid') ?? '');
    expect(order.indexOf('journal-visit-past')).toBeLessThan(order.indexOf('journal-now'));
    expect(order.indexOf('journal-now')).toBeLessThan(order.indexOf('journal-visit-ahead'));
    expect(now).toHaveTextContent('Сейчас');
  });

  it('should not draw the «now» line on another day', async () => {
    visit(`?date=${shiftDateKey(TODAY, -1)}`);
    setup();

    await findTable();

    expect(screen.queryByTestId('journal-now')).not.toBeInTheDocument();
  });

  it('should keep the badge of a no-show readable on the card tinted with its own colour', async () => {
    setup();

    const badge = within(await screen.findByTestId('journal-visit-a2')).getByTestId('stamp-noshow');

    expect(badge).toHaveClass('bg-card', 'ring-warning');
    expect(badge).not.toHaveClass('bg-warning-soft');
  });

  it('should link the patient name to the patient card', async () => {
    setup();

    expect(within(await findTable()).getByRole('link', { name: 'Кузнецов Алексей' })).toHaveAttribute('href', '/patients/p1');
  });

  it('should offer opening and no-show only for the booked visit (BR-008)', async () => {
    setup();
    await findTable();

    expect(screen.getAllByRole('button', { name: /Открыть приём/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Действия с записью/ })).toHaveLength(1);
  });

  it('should keep the no-show away from the «Карта пациента» button and behind a menu with a confirmation (A5)', async () => {
    setup();
    await findTable();
    expect(screen.queryByRole('button', { name: 'Неявка' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Действия с записью/ }));
    const item = screen.getByRole('menuitem', { name: 'Неявка' });
    expect(item).toHaveClass('text-destructive');
    await userEvent.click(item);

    expect(screen.getByRole('dialog', { name: 'Отметить неявку?' })).toBeInTheDocument();
  });

  it('should fall back to the patient id when the service sent no name', async () => {
    setup();

    expect(within(await findTable()).getByText('Пациент p4')).toBeInTheDocument();
  });

  it('should not link the patient of a cancelled or no-show visit to a card the doctor cannot open (403)', async () => {
    setup();
    const timeline = within(await findTable());

    expect(timeline.getByRole('link', { name: 'Новиков Пётр' })).toHaveAttribute('href', '/patients/p3');
    expect(timeline.queryByRole('link', { name: 'Лебедева Ирина' })).toBeNull();
    expect(timeline.getByText('Лебедева Ирина')).toBeInTheDocument();
    expect(timeline.queryByRole('link', { name: 'Пациент p4' })).toBeNull();
    expect(timeline.getByText('Пациент p4')).toBeInTheDocument();
  });

  it('should say that today has no appointments and name the next one with a button to jump there (A12)', async () => {
    const tomorrow: string = shiftDateKey(TODAY, 1);
    const next = appointment({ id: 'n1', patientName: 'Кузнецов Павел', start: `${tomorrow}T07:00:00Z`, end: `${tomorrow}T07:30:00Z` });
    setup(() => pageOf([]));
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.includes(encodeURIComponent(`${TODAY}T23:59:59+03:00`)) ? pageOf([]) : pageOf([next])));

    expect(await screen.findByText('Сегодня записей нет')).toBeInTheDocument();
    expect(await screen.findByText('Ближайший приём — завтра, 10:00, Кузнецов П.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Перейти к приёму' }));

    await waitFor(() => expect(window.location.search).toBe(`?date=${tomorrow}`));
  });

  it('should look no further than 14 days ahead and say so when nothing is booked (A12)', async () => {
    setup(() => pageOf([]));

    expect(await screen.findByText('Сегодня записей нет')).toBeInTheDocument();
    expect(await screen.findByText('В ближайшие 14 дн. записей нет.')).toBeInTheDocument();
    const lookAhead = callsTo(apiFetchMock, JOURNAL).map(([path]) => new URL(path, 'http://x').searchParams).find((query) => query.get('from')?.startsWith(shiftDateKey(TODAY, 1)));
    expect(lookAhead?.get('to')).toBe(`${shiftDateKey(TODAY, 14)}T23:59:59+03:00`);
    expect(screen.queryByRole('button', { name: 'Перейти к приёму' })).not.toBeInTheDocument();
  });

  it('should name the day instead of «сегодня» when another empty day is open', async () => {
    const day: string = shiftDateKey(TODAY, -1);
    visit(`?date=${day}`);
    setup(() => pageOf([]));

    expect(await screen.findByText(/^На .* записей нет$/)).toBeInTheDocument();
  });

  it('should hide the rows of other statuses when a status is chosen', async () => {
    setup();
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'noshow');

    const table = within(screen.getByRole('region', { name: 'Приёмы по времени' }));
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
    expect(lastQuery().get('from')).toBe(`${tomorrow}T00:00:00+03:00`);
  });

  it('should load the previous day and enable the today button when the previous-day button is pressed', async () => {
    setup();
    await findTable();
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий день' }));

    expect(lastQuery().get('from')).toBe(`${shiftDateKey(TODAY, -1)}T00:00:00+03:00`);
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('should keep keyboard focus on the today button when it is activated', async () => {
    visit(`?date=${shiftDateKey(TODAY, -2)}`);
    setup();
    await findTable();
    const today = screen.getByRole('button', { name: 'Сегодня' });
    today.focus();

    await userEvent.keyboard('{Enter}');

    expect(lastQuery().get('from')).toBe(`${TODAY}T00:00:00+03:00`);
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute('aria-disabled', 'true');
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

    expect(lastQuery().get('pageSize')).toBe('50');
  });

  it('should start on the day given in the address bar when it is a real date', async () => {
    visit('?date=2026-10-19');
    setup();

    await findTable();

    expect(lastQuery().get('from')).toBe('2026-10-19T00:00:00+03:00');
  });

  it('should fall back to today when the day in the address bar is not a date', async () => {
    visit('?date=soon');
    setup();

    await findTable();

    expect(lastQuery().get('from')).toBe(`${TODAY}T00:00:00+03:00`);
  });

  it('should write the chosen day into the address bar when the day changes', async () => {
    setup();
    await findTable();

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));

    expect(window.location.search).toBe(`?date=${shiftDateKey(TODAY, 1)}`);
  });

  it('should follow the address bar when a navigation drops the day while the journal stays mounted', async () => {
    visit('?date=2026-10-19');
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [{ path: JOURNAL, respond: () => pageOf(ROWS) }]);
    const { rerender } = renderWithClient(<DoctorJournal />);
    await findTable();
    expect(lastQuery().get('from')).toBe('2026-10-19T00:00:00+03:00');

    visit('');
    rerender(<DoctorJournal />);

    await waitFor(() => expect(lastQuery().get('from')).toBe(`${TODAY}T00:00:00+03:00`));
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('should return to page 1 when the day changes while a later page is open', async () => {
    setup(() => pageOf(ROWS, 1, 3));
    await findTable();
    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'));

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));

    await waitFor(() => expect(lastQuery().get('page')).toBe('1'));
  });

  it('should move a journal that follows today to the new day when midnight passes in Minsk', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-20T20:59:30Z'), advanceTimers: true });
    try {
      setup();
      await findTable();
      expect(lastQuery().get('from')).toBe('2026-10-20T00:00:00+03:00');

      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      await waitFor(() => expect(lastQuery().get('from')).toBe('2026-10-21T00:00:00+03:00'));
      expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-disabled', 'true');
    } finally {
      jest.useRealTimers();
    }
  });

  describe('week view', () => {
    async function openWeek(): Promise<void> {
      setup();
      await findTable();
      await userEvent.click(screen.getByRole('button', { name: 'Неделя' }));
    }

    it('should request the five working days at once and show each visit as a block at its time', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-21T09:00:00Z'), advanceTimers: true });
      try {
        await openWeek();

        await screen.findAllByRole('link', { name: /09:00 Кузнецов Алексей, Записан/ });
        const froms = new Set(callsTo(apiFetchMock, JOURNAL).map(([path]) => new URL(path, 'http://x').searchParams.get('from')));
        expect(froms.size).toBe(5);
        expect(screen.getAllByRole('list', { name: /\d{1,2}/ }).length).toBeGreaterThanOrEqual(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should apply the status filter to the blocks', async () => {
      await openWeek();
      await screen.findAllByRole('link', { name: /Кузнецов Алексей/ });

      await userEvent.selectOptions(screen.getByLabelText('Статус'), 'noshow');

      expect(screen.queryAllByRole('link', { name: /Кузнецов Алексей/ })).toHaveLength(0);
      expect(screen.getAllByRole('group', { name: /Лебедева Ирина, Неявка/ }).length).toBeGreaterThan(0);
      expect(screen.queryAllByRole('link', { name: /Лебедева Ирина/ })).toHaveLength(0);
    });

    it('should open the day in the day view when its heading is pressed', async () => {
      await openWeek();
      await screen.findAllByRole('link', { name: /Кузнецов Алексей/ });

      await userEvent.click(screen.getAllByRole('button', { name: /^Открыть день:/ })[1] as HTMLElement);

      expect(await findTable()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'День' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('should move by a week when the next button is pressed', async () => {
      await openWeek();
      await screen.findAllByRole('link', { name: /Кузнецов Алексей/ });

      await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));

      expect(window.location.search).toBe(`?date=${shiftDateKey(TODAY, 7)}`);
    });
  });
});
