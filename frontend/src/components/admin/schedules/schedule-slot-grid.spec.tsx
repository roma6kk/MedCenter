import { fireEvent, screen, waitFor } from '@testing-library/react';
import { apiFetch } from '@/lib/api/api-fetch';
import { renderWithClient } from '../shared/test-utils';
import { ScheduleSlotGrid } from './schedule-slot-grid';
import type { AdminSchedule, ScheduleSlot } from './schedule-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock('../shared/admin-dates', () => ({ ...jest.requireActual('../shared/admin-dates'), todayKey: () => '2026-10-16' }));

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;
const schedule: AdminSchedule = { id: '2572', isActive: true, windows: [] };

const slots: ReadonlyArray<ScheduleSlot> = [
  { id: 'a', scheduleId: '2572', start: '2026-10-18T19:00:00.000Z', end: '2026-10-18T19:25:00.000Z', status: 'free' },
  { id: 'b', scheduleId: '2572', start: '2026-10-18T19:25:00.000Z', end: '2026-10-18T19:50:00.000Z', status: 'busy' },
  { id: 'c', scheduleId: '2572', start: '2026-10-25T19:00:00.000Z', end: '2026-10-25T19:25:00.000Z', status: 'entered-in-error' },
];

describe('ScheduleSlotGrid', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(slots);
  });

  it('should request the next 14 days of the schedule and show the clinic times grouped by day when the grid opens', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);

    expect(await screen.findAllByText('22:00–22:25')).toHaveLength(2);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572/slots?from=2026-10-16&to=2026-10-30');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('should open at the first day of the horizon when the schedule starts after today', async () => {
    const later: AdminSchedule = { ...schedule, horizonFrom: '2026-11-02', horizonTo: '2026-11-30' };
    renderWithClient(<ScheduleSlotGrid schedule={later} />);

    await screen.findAllByText('22:00–22:25');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572/slots?from=2026-11-02&to=2026-11-16');
    expect(screen.getByLabelText('С')).toHaveValue('2026-11-02');
  });

  it('should tell free, busy and entered-in-error slots apart and count them when the slots arrive', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);

    expect(await screen.findByTestId('slot-free')).toBeInTheDocument();
    expect(screen.getByTestId('slot-busy')).toBeInTheDocument();
    expect(screen.getByTestId('slot-entered-in-error')).toBeInTheDocument();
    expect(screen.getByText('Всего слотов: 3 · свободно: 1 · занято: 1 · недействительно: 1')).toBeInTheDocument();
  });

  it('should ask only for the invalid slots when that status is chosen', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);
    await screen.findByTestId('slot-free');

    fireEvent.change(screen.getByLabelText('Статус слотов'), { target: { value: 'entered-in-error' } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572/slots?from=2026-10-16&to=2026-10-30&status=entered-in-error'));
  });

  it('should show the empty state when the period has no slots', async () => {
    apiFetchMock.mockResolvedValue([]);
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Слотов за период нет');
  });

  it('should warn that the list may be incomplete and not print the total as exact when exactly 20 slots arrive', async () => {
    const page: ReadonlyArray<ScheduleSlot> = Array.from({ length: 20 }, (_, index) => ({
      id: `s${index}`,
      scheduleId: '2572',
      start: `2026-10-18T${String(5 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}:00.000Z`,
      end: '2026-10-18T19:25:00.000Z',
      status: 'free' as const,
    }));
    apiFetchMock.mockResolvedValue(page);
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);

    expect(await screen.findByTestId('slots-truncated')).toHaveTextContent('ровно 20 слотов');
    expect(screen.getByText(/Показано слотов: 20/)).toBeInTheDocument();
    expect(screen.queryByText(/Всего слотов/)).not.toBeInTheDocument();
  });

  it('should not warn when fewer than 20 slots arrive', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);
    await screen.findByTestId('slot-free');

    expect(screen.queryByTestId('slots-truncated')).not.toBeInTheDocument();
  });

  it('should not ask the server and explain the problem when a date is cleared', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);
    await screen.findByTestId('slot-free');
    apiFetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '' } });

    expect(await screen.findByText('Введите корректные даты')).toBeInTheDocument();
    expect(screen.getByLabelText('С')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('По')).toHaveAccessibleDescription('Введите корректные даты');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should not ask the server when the period is longer than 90 days', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);
    await screen.findByTestId('slot-free');
    apiFetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2027-03-01' } });

    expect(await screen.findByText('Период не должен превышать 90 дней')).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should ask again when the dates are fixed after an invalid period', async () => {
    renderWithClient(<ScheduleSlotGrid schedule={schedule} />);
    await screen.findByTestId('slot-free');
    fireEvent.change(screen.getByLabelText('С'), { target: { value: '' } });
    await screen.findByText('Введите корректные даты');

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-10-17' } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572/slots?from=2026-10-17&to=2026-10-30'));
    expect(await screen.findByTestId('slot-free')).toBeInTheDocument();
  });
});
