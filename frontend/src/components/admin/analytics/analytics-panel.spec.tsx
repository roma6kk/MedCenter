import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { currentYearRange } from '../shared/report-range';
import { AnalyticsPanel } from './analytics-panel';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;
const period = { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' };

const appointments: AppointmentsReport = {
  measure: 'appointments-by-status',
  scoring: 'cohort',
  period,
  total: 77,
  groups: [{ code: 'booked', count: 19 }, { code: 'cancelled', count: 43 }, { code: 'noshow', count: 15 }],
  booked: 19,
  cancelled: 43,
  noshow: 15,
};

const encounters: MeasureReport = {
  measure: 'encounters-by-specialty',
  scoring: 'cohort',
  period,
  total: 17,
  groups: [{ code: '419192003', system: 'http://snomed.info/sct', display: 'Терапия', count: 16 }, { code: '394579002', display: 'Кардиология', count: 1 }],
};

const services: MeasureReport = {
  measure: 'services-popularity',
  scoring: 'cohort',
  period,
  total: 18,
  groups: [{ code: 'svc-1', display: 'Приём терапевта', count: 17 }, { code: 'svc-gone', count: 1 }],
};

function answer(path: string): Promise<unknown> {
  if (path.includes('/appointments')) return Promise.resolve(appointments);
  if (path.includes('/encounters')) return Promise.resolve(encounters);
  return Promise.resolve(services);
}

function calledPaths(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls.map(([path]) => path);
}

describe('AnalyticsPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(answer);
  });

  it('should request the three reports for the current year with the default top of 10 when it mounts', async () => {
    renderWithClient(<AnalyticsPanel />);
    const { from, to } = currentYearRange();

    await screen.findByText('77');

    expect(calledPaths()).toEqual(
      expect.arrayContaining([
        `/api/v1/admin/analytics/appointments?from=${from}&to=${to}`,
        `/api/v1/admin/analytics/encounters?from=${from}&to=${to}`,
        `/api/v1/admin/analytics/services-popularity?from=${from}&to=${to}&top=10`,
      ]),
    );
  });

  it('should show the appointment totals with a stamp per status when the report arrives', async () => {
    renderWithClient(<AnalyticsPanel />);

    const section = within(await screen.findByRole('region', { name: 'Записи на приём' }));

    expect(await section.findByText('77')).toBeInTheDocument();
    expect(section.getByTestId('stamp-booked')).toHaveTextContent('Записано');
    expect(section.getByText('43')).toBeInTheDocument();
    expect(section.getByText('15')).toBeInTheDocument();
  });

  it('should show the attended visits as their own card when the report has a fulfilled group', async () => {
    apiFetchMock.mockImplementation((path) =>
      path.includes('/appointments')
        ? Promise.resolve({ ...appointments, total: 83, groups: [...appointments.groups, { code: 'fulfilled', count: 6 }], fulfilled: 6 })
        : answer(path),
    );
    renderWithClient(<AnalyticsPanel />);

    const section = within(await screen.findByRole('region', { name: 'Записи на приём' }));

    expect(await section.findByTestId('stamp-fulfilled')).toHaveTextContent('Посещено');
    expect(section.getAllByTestId('kpi')).toHaveLength(5);
    expect(section.getByTestId('bar-fulfilled')).toBeInTheDocument();
  });

  it('should list the encounters by specialty with the share of each when the report arrives', async () => {
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Завершённые приёмы по специальностям' }));

    expect(await table.findByText('Терапия')).toBeInTheDocument();
    expect(table.getByText('94%')).toBeInTheDocument();
    expect(table.getByText('6%')).toBeInTheDocument();
  });

  it('should list the top services and name a deleted one by its unavailable label and id when the report arrives', async () => {
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Топ-10 услуг по записям' }));

    expect(await table.findByText('Приём терапевта')).toBeInTheDocument();
    expect(table.getByText('Услуга удалена или недоступна')).toBeInTheDocument();
    expect(table.getByText('svc-gone')).toBeInTheDocument();
    expect(table.queryByText('svc-1')).not.toBeInTheDocument();
  });

  it('should send the chosen period and top when the filter is applied', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByText('77');

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-09-30' } });
    await userEvent.selectOptions(screen.getByLabelText('Топ услуг'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Показать' }));

    await waitFor(() => expect(calledPaths()).toContain('/api/v1/admin/analytics/services-popularity?from=2026-09-01&to=2026-09-30&top=20'));
    expect(calledPaths()).toContain('/api/v1/admin/analytics/appointments?from=2026-09-01&to=2026-09-30');
  });

  it('should refuse a period over 366 days and not call the API again when the filter is applied', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByText('77');
    const calls = apiFetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2025-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Показать' }));

    expect(await screen.findByText('Период не может превышать 366 дней')).toBeInTheDocument();
    expect(screen.getByLabelText('С')).toHaveFocus();
    expect(apiFetchMock.mock.calls).toHaveLength(calls);
  });

  it('should refuse a period that ends before it starts when the filter is applied', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByText('77');

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2025-12-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Показать' }));

    expect(await screen.findByText('Дата начала позже даты окончания')).toBeInTheDocument();
  });

  it('should fail one report without taking the others down and retry only that one when its request fails', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/encounters') ? Promise.reject(apiProblem({ status: 500, errorCode: 'INTERNAL' })) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    const section = within(await screen.findByRole('region', { name: 'Завершённые приёмы по специальностям' }));
    expect(await section.findByTestId('problem-banner')).toBeInTheDocument();
    expect(await screen.findByText('77')).toBeInTheDocument();

    await userEvent.click(section.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => expect(calledPaths().filter((path) => path.includes('/encounters')).length).toBeGreaterThanOrEqual(2));
  });

  it('should show the empty state of a report when it has no data in the period', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/services-popularity') ? Promise.resolve({ ...services, total: 0, groups: [] }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    const section = within(await screen.findByRole('region', { name: 'Топ-10 услуг по записям' }));

    expect(await section.findByTestId('empty-state')).toHaveTextContent('Нет данных за выбранный период');
  });

  it('should keep the report sections in shrinkable columns when a wide table could widen the page on a phone', async () => {
    renderWithClient(<AnalyticsPanel />);
    const appointmentsSection = (await screen.findByRole('heading', { name: 'Записи на приём' })).closest('section');
    const encountersSection = (await screen.findByRole('heading', { name: 'Завершённые приёмы по специальностям' })).closest('section');

    expect(appointmentsSection?.parentElement).toHaveClass('grid-cols-1');
    expect(encountersSection?.parentElement).toHaveClass('grid-cols-1');
  });

  it('should let the keyboard reach a table that scrolls sideways when the group table is wider than its section', async () => {
    renderWithClient(<AnalyticsPanel />);

    const table = await screen.findByRole('table', { name: 'Завершённые приёмы по специальностям' });

    expect(table.parentElement).toHaveAttribute('tabindex', '0');
  });
  it('should state the main finding as the heading and compute the cancellation card from the report when most appointments are cancelled', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/appointments') ? Promise.resolve({ ...appointments, total: 117, groups: [{ code: 'booked', count: 34 }, { code: 'cancelled', count: 62 }, { code: 'noshow', count: 21 }] }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Больше половины записей отменяется до приёма' })).toBeInTheDocument();
    const cards = await screen.findAllByTestId('insight');
    expect(cards[0]).toHaveTextContent('53%');
    expect(cards[0]).toHaveTextContent('62 из 117. Это больше, чем записанные и неявки вместе.');
    expect(cards[1]).toHaveTextContent('Неявки · 18%');
    expect(cards[2]).toHaveTextContent('94%');
    expect(within(cards[0] as HTMLElement).getByRole('link', { name: 'Посмотреть отмены в аудите' })).toHaveAttribute('href', '/admin/audit');
  });

  it('should merge the deleted services into one row with the ids behind a disclosure and link to the service catalogue when the report has nameless groups', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/services-popularity') ? Promise.resolve({ ...services, total: 20, groups: [{ code: 'svc-1', display: 'Приём терапевта', count: 17 }, { code: 'gone-a', count: 2 }, { code: 'gone-b', count: 1 }] }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Топ-10 услуг по записям' }));

    expect(await table.findByText('Удалённые или недоступные услуги (2)')).toBeInTheDocument();
    expect(table.getAllByTestId('unnamed-row')).toHaveLength(1);
    expect(table.getByText('gone-a').closest('details')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'каталоге услуг' })).toHaveAttribute('href', '/admin/services');
  });

  it('should show no insight card, no check list and a plain heading when the period has no appointments or encounters', async () => {
    const none = { ...appointments, total: 0, groups: [], booked: 0, cancelled: 0, noshow: 0 };
    apiFetchMock.mockImplementation((path) => Promise.resolve(path.includes('/appointments') ? none : { ...encounters, total: 0, groups: [] }));
    renderWithClient(<AnalyticsPanel />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Аналитика' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('empty-state').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('insight')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Что стоит проверить' })).not.toBeInTheDocument();
  });

  it('should draw only the statuses that occurred when a single appointment is booked', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/appointments') ? Promise.resolve({ ...appointments, total: 1, groups: [{ code: 'booked', count: 1 }], booked: 1, cancelled: 0, noshow: 0 }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    expect(await screen.findByTestId('bar-booked')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-cancelled')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Записанных больше, чем отмен и неявок' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Посмотреть отмены в аудите' })).not.toBeInTheDocument();
  });
});
