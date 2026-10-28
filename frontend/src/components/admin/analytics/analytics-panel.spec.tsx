jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { clinicDateKey } from '@/lib/clinic-time';
import { presetRange, previousRange } from './analytics-period';
import { bucketsOf } from './analytics-series';
import { AnalyticsPanel } from './analytics-panel';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;
const TODAY = clinicDateKey();
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
    window.history.replaceState(null, '', '/admin/analytics');
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(answer);
  });

  it('should request the reports for this month, the month before and the top of 10 when it mounts', async () => {
    renderWithClient(<AnalyticsPanel />);
    const month = presetRange('month', TODAY);
    const before = previousRange('month', month);

    await screen.findByRole('heading', { level: 2, name: 'Записи на приём' });

    await waitFor(() =>
      expect(calledPaths()).toEqual(
        expect.arrayContaining([
          `/api/v1/admin/analytics/appointments?from=${month.from}&to=${month.to}`,
          `/api/v1/admin/analytics/appointments?from=${before.from}&to=${before.to}`,
          `/api/v1/admin/analytics/encounters?from=${month.from}&to=${month.to}`,
          `/api/v1/admin/analytics/services-popularity?from=${month.from}&to=${month.to}&top=10`,
        ]),
      ),
    );
  });

  it('should name the period in the heading instead of a generated conclusion when it mounts', async () => {
    renderWithClient(<AnalyticsPanel />);

    expect(await screen.findByRole('heading', { level: 1, name: /^Аналитика за (январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь) \d{4}/ })).toBeInTheDocument();
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
    expect(section.getAllByTestId('kpi')[2]).toHaveTextContent('6');
  });

  it('should draw the encounters by specialty as bars with the count and share of each when the report arrives', async () => {
    renderWithClient(<AnalyticsPanel />);

    const list = within(await screen.findByRole('list', { name: 'Завершённые приёмы по специальностям' }));

    expect(await list.findByText('Терапия')).toBeInTheDocument();
    expect(list.getByText('· 94%')).toBeInTheDocument();
    expect(list.getByText('· 6%')).toBeInTheDocument();
    const fills = list.getAllByTestId('share-bar-fill');
    expect(fills[0]).toHaveStyle({ width: '100%' });
    expect(fills[1]).toHaveStyle({ width: '6.25%' });
  });

  it('should list the top services and name a deleted one by its unavailable label and id when the report arrives', async () => {
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Топ-10 услуг по записям' }));

    expect(await table.findByText('Приём терапевта')).toBeInTheDocument();
    expect(table.getByText('Услуга удалена или недоступна')).toBeInTheDocument();
    expect(table.getByText('svc-gone')).toBeInTheDocument();
    expect(table.queryByText('svc-1')).not.toBeInTheDocument();
  });

  it('should request the week and write it to the address when the quick period «Неделя» is chosen, without any apply button', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByRole('heading', { level: 2, name: 'Записи на приём' });

    await userEvent.click(screen.getByRole('button', { name: 'Неделя' }));

    const week = presetRange('week', TODAY);
    await waitFor(() => expect(calledPaths()).toContain(`/api/v1/admin/analytics/appointments?from=${week.from}&to=${week.to}`));
    expect(screen.getByRole('heading', { level: 1, name: 'Аналитика за неделю' })).toBeInTheDocument();
    expect(window.location.search).toBe('?period=week');
    expect(screen.queryByRole('button', { name: 'Показать' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Неделя' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should open with the period of the address when the address names one', async () => {
    window.history.replaceState(null, '', '/admin/analytics?period=custom&from=2026-09-01&to=2026-09-30&top=20');
    renderWithClient(<AnalyticsPanel />);

    await waitFor(() => expect(calledPaths()).toContain('/api/v1/admin/analytics/services-popularity?from=2026-09-01&to=2026-09-30&top=20'));
    expect(screen.getByRole('heading', { level: 1, name: 'Аналитика за 01.09.2026 – 30.09.2026' })).toBeInTheDocument();
    expect(screen.getByLabelText('С')).toHaveValue('01.09.2026');
  });

  it('should send the custom period and the top as soon as they are valid when the dates are changed', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByRole('heading', { level: 2, name: 'Записи на приём' });

    await userEvent.click(screen.getByRole('button', { name: 'Свой период' }));
    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-09-30' } });
    await userEvent.selectOptions(screen.getByLabelText('Топ услуг'), '20');

    await waitFor(() => expect(calledPaths()).toContain('/api/v1/admin/analytics/services-popularity?from=2026-09-01&to=2026-09-30&top=20'));
    expect(calledPaths()).toContain('/api/v1/admin/analytics/appointments?from=2026-09-01&to=2026-09-30');
    expect(window.location.search).toBe('?period=custom&from=2026-09-01&to=2026-09-30&top=20');
  });

  it('should refuse a period over 366 days and not call the API for it when the dates are changed', async () => {
    renderWithClient(<AnalyticsPanel />);
    await screen.findByRole('heading', { level: 2, name: 'Записи на приём' });
    await userEvent.click(screen.getByRole('button', { name: 'Свой период' }));
    await waitFor(() => expect(screen.getByLabelText('С')).toBeInTheDocument());
    const calls = apiFetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2025-01-01' } });

    expect(await screen.findByText('Период не может превышать 366 дней')).toBeInTheDocument();
    expect(apiFetchMock.mock.calls).toHaveLength(calls);
  });

  it('should refuse a period that ends before it starts when the dates are changed', async () => {
    renderWithClient(<AnalyticsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Свой период' }));

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2020-12-31' } });

    expect(await screen.findByText('Дата начала позже даты окончания')).toBeInTheDocument();
  });

  it('should show the change against the previous period with a word for it when the previous report arrives', async () => {
    const month = presetRange('month', TODAY);
    const before = previousRange('month', month);
    apiFetchMock.mockImplementation((path) =>
      path.includes(`/appointments?from=${before.from}&to=${before.to}`)
        ? Promise.resolve({ ...appointments, total: 70, groups: [{ code: 'booked', count: 19 }, { code: 'cancelled', count: 50 }, { code: 'noshow', count: 1 }], booked: 19, cancelled: 50, noshow: 1 })
        : answer(path),
    );
    renderWithClient(<AnalyticsPanel />);

    const kpis = await screen.findAllByTestId('kpi');
    const delta = (index: number): HTMLElement => within(kpis[index] as HTMLElement).getByTestId('kpi-delta');

    await waitFor(() => expect(delta(0)).toHaveTextContent('+7 (+10%) к прошлому месяцу'));
    expect(delta(1)).toHaveTextContent('без изменений');
    expect(delta(3)).toHaveTextContent('Снижение: −7 (−14%)');
    expect(delta(4)).toHaveTextContent('Рост: +14');
    expect(within(kpis[3] as HTMLElement).getByText('56% от всех записей')).toBeInTheDocument();
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

    const table = await screen.findByRole('table', { name: 'Топ-10 услуг по записям' });

    expect(table.parentElement).toHaveAttribute('tabindex', '0');
  });

  it('should compute the cancellation card from the report when most appointments are cancelled', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/appointments') ? Promise.resolve({ ...appointments, total: 117, groups: [{ code: 'booked', count: 34 }, { code: 'cancelled', count: 62 }, { code: 'noshow', count: 21 }] }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    const cards = await screen.findAllByTestId('insight');

    expect(cards[0]).toHaveTextContent('53%');
    expect(cards[0]).toHaveTextContent('62 из 117. Это больше, чем записанные и неявки вместе.');
    expect(cards[1]).toHaveTextContent('Неявки · 18%');
    expect(cards[2]).toHaveTextContent('94%');
    expect(within(cards[0] as HTMLElement).getByRole('link', { name: 'Посмотреть отмены в аудите' })).toHaveAttribute('href', '/admin/audit');
  });

  it('should merge the deleted services into one row with the ids behind a disclosure when the report has nameless groups', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/services-popularity') ? Promise.resolve({ ...services, total: 20, groups: [{ code: 'svc-1', display: 'Приём терапевта', count: 17 }, { code: 'gone-a', count: 2 }, { code: 'gone-b', count: 1 }] }) : answer(path)));
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Топ-10 услуг по записям' }));

    expect(await table.findByText('Удалённые или недоступные услуги (2)')).toBeInTheDocument();
    expect(table.getAllByTestId('unnamed-row')).toHaveLength(1);
    expect(table.getByText('gone-a').closest('details')).toBeInTheDocument();
  });

  it('should draw a share bar next to the percentage of every service when the top services arrive', async () => {
    renderWithClient(<AnalyticsPanel />);

    const table = within(await screen.findByRole('table', { name: 'Топ-10 услуг по записям' }));

    await table.findByText('Приём терапевта');
    expect(table.getAllByTestId('share-bar-fill')[0]).toHaveStyle({ width: '94%' });
  });

  it('should show no insight card, no chart and no filler block when the period has no appointments or encounters', async () => {
    const none = { ...appointments, total: 0, groups: [], booked: 0, cancelled: 0, noshow: 0 };
    apiFetchMock.mockImplementation((path) => Promise.resolve(path.includes('/appointments') ? none : { ...encounters, total: 0, groups: [] }));
    renderWithClient(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getAllByTestId('empty-state').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('insight')).not.toBeInTheDocument();
    expect(screen.queryByTestId('appointments-chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Что стоит проверить' })).not.toBeInTheDocument();
  });

  it('should show a single booked appointment as tiles without a trend when the period is one day', async () => {
    apiFetchMock.mockImplementation((path) => (path.includes('/appointments') ? Promise.resolve({ ...appointments, total: 1, groups: [{ code: 'booked', count: 1 }], booked: 1, cancelled: 0, noshow: 0 }) : answer(path)));
    window.history.replaceState(null, '', '/admin/analytics?period=today');
    renderWithClient(<AnalyticsPanel />);

    const kpis = await screen.findAllByTestId('kpi');

    expect(kpis).toHaveLength(5);
    expect(within(kpis[1] as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(screen.queryByTestId('appointments-chart')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Аналитика за сегодня' })).toBeInTheDocument();
  });

  describe('chart over time', () => {
    const month = presetRange('month', TODAY);
    const columns = bucketsOf(month).length;

    async function openChart(): Promise<ReturnType<typeof within>> {
      renderWithClient(<AnalyticsPanel />);
      const chart = within(await screen.findByTestId('appointments-chart'));
      await waitFor(() => expect(chart.getAllByTestId('chart-column')).toHaveLength(columns));
      return chart;
    }

    it('should ask the appointments report once per day of the month and draw a stacked column for each', async () => {
      await openChart();

      expect(calledPaths()).toContain(`/api/v1/admin/analytics/appointments?from=${month.from}&to=${month.from}`);
      expect(calledPaths()).toContain(`/api/v1/admin/analytics/appointments?from=${month.to}&to=${month.to}`);
    });

    it('should spell the statuses out in a legend so that colour is never the only key', async () => {
      const chart = await openChart();

      const legend = within(chart.getByRole('list', { name: 'Статусы записей' }));

      expect(legend.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Записано', 'Посещено', 'Отменено', 'Неявки']);
    });

    it('should show every status of the focused column in a tooltip and move along the columns with the arrow keys', async () => {
      const chart = await openChart();
      const group = chart.getByRole('group', { name: /^Записи по времени, всего \d+/ });

      fireEvent.focus(group);
      const tooltip = within(chart.getByTestId('chart-tooltip'));
      expect(tooltip.getByText('Записано')).toBeInTheDocument();
      expect(tooltip.getByText('Неявки')).toBeInTheDocument();
      expect(chart.getByTestId('chart-tooltip')).toHaveTextContent('77 всего записей');

      fireEvent.keyDown(group, { key: 'ArrowRight' });
      expect(group).toHaveAccessibleDescription(/записано 19, посещено 0, отменено 43, неявки 15/);

      fireEvent.blur(group);
      expect(chart.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
    });

    it('should offer the same numbers as a table when the table view is chosen', async () => {
      const chart = await openChart();

      await userEvent.click(chart.getByRole('button', { name: 'Таблица' }));

      const table = within(chart.getByRole('table', { name: 'Записи по времени и статусам' }));
      expect(table.getAllByRole('row')).toHaveLength(columns + 1);
      expect(table.getAllByText('77')).toHaveLength(columns);
      expect(chart.queryByTestId('chart-column')).not.toBeInTheDocument();
    });

    it('should say there is nothing to draw when every column is empty', async () => {
      const month = presetRange('month', TODAY);
      apiFetchMock.mockImplementation((path) =>
        path.includes('/appointments') && !path.includes(`from=${month.from}&to=${month.to}`) ? Promise.resolve({ ...appointments, total: 0, groups: [], booked: 0, cancelled: 0, noshow: 0 }) : answer(path),
      );
      renderWithClient(<AnalyticsPanel />);

      expect(await screen.findByTestId('chart-empty')).toHaveTextContent('В этом периоде нет записей');
    });

    it('should ask again only for the failed columns when the trend could not be loaded', async () => {
      const failing = `/api/v1/admin/analytics/appointments?from=${month.from}&to=${month.from}`;
      apiFetchMock.mockImplementation((path) => (path === failing ? Promise.reject(apiProblem({ status: 500, errorCode: 'INTERNAL' })) : answer(path)));
      renderWithClient(<AnalyticsPanel />);

      const alert = await screen.findByText('Не удалось загрузить динамику записей.');
      const before = calledPaths().filter((path) => path === failing).length;
      await userEvent.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Повторить' }));

      await waitFor(() => expect(calledPaths().filter((path) => path === failing).length).toBeGreaterThan(before));
      expect(calledPaths().filter((path) => path.includes(`from=${month.from}&to=${month.to}`) && path.includes('/appointments'))).toHaveLength(1);
    });
  });
});
