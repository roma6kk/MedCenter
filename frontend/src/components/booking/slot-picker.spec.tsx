import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { ApiError, apiFetch } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import type { Slot } from '@/components/catalog/catalog-types';
import { SlotPicker, type SlotPickerProps } from './slot-picker';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, shiftDay, todayInClinic } from './slot-time';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;

const TODAY: string = todayInClinic();
const DAY_AFTER: string = shiftDay(TODAY, 2);

function slot(id: string, day: string, hour: number, minutes: number, status: Slot['status'] = 'free'): Slot {
  const start: number = Date.parse(`${day}T00:00:00.000Z`) + hour * 3_600_000;
  return { id, start: new Date(start).toISOString(), end: new Date(start + minutes * 60_000).toISOString(), status };
}

const SLOTS: ReadonlyArray<Slot> = [slot('s-1', TODAY, 9, 30), slot('s-2', TODAY, 10, 30), slot('s-3', DAY_AFTER, 9, 20)];

function answer(items: ReadonlyArray<Slot>, extra: Record<string, unknown> = {}): void {
  apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', from: TODAY, to: DAY_AFTER, items, ...extra });
}

function renderPicker(props: Partial<SlotPickerProps> = {}): { onSelect: jest.Mock } {
  const onSelect = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<SlotPicker doctorId="doc-1" selectedSlotId={null} onSelect={onSelect} {...props} />, { wrapper: Wrapper });
  return { onSelect };
}

describe('SlotPicker', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should search the doctor slots of the next two weeks from today when the picker opens', async () => {
    answer(SLOTS);
    renderPicker();

    await screen.findByTestId('slot-s-1');

    const to: string = shiftDay(TODAY, SLOT_WINDOW_DAYS - 1);
    expect(apiFetchMock).toHaveBeenCalledWith(`/api/v1/doctors/doc-1/slots?from=${TODAY}&to=${to}`);
  });

  it('should group the slots by day when the search answers', async () => {
    answer(SLOTS);
    renderPicker();

    const first = await screen.findByTestId(`slot-day-${TODAY}`);

    expect(within(first).getAllByRole('button')).toHaveLength(2);
    expect(within(screen.getByTestId(`slot-day-${DAY_AFTER}`)).getAllByRole('button')).toHaveLength(1);
  });

  it('should hand the chosen slot to the caller when a free slot is clicked', async () => {
    answer(SLOTS);
    const { onSelect } = renderPicker();

    await userEvent.click(await screen.findByTestId('slot-s-2'));

    expect(onSelect).toHaveBeenCalledWith(SLOTS[1]);
  });

  it('should mark the selected slot as pressed when a slot is selected', async () => {
    answer(SLOTS);
    renderPicker({ selectedSlotId: 's-2' });

    expect(await screen.findByTestId('slot-s-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('slot-s-1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('should show a busy slot as inert and not select it when the search lists one', async () => {
    answer([slot('s-b', TODAY, 9, 30, 'busy')]);
    const { onSelect } = renderPicker();

    const tile = await screen.findByTestId('slot-s-b');
    await userEvent.click(tile);

    expect(tile).toHaveAttribute('aria-disabled', 'true');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should show a withdrawn slot as inert when the search lists an entered-in-error slot', async () => {
    answer([slot('s-e', TODAY, 9, 30, 'entered-in-error')]);
    renderPicker();

    expect(await screen.findByTestId('slot-s-e')).toHaveAttribute('aria-disabled', 'true');
  });

  it('should offer only slots as long as the chosen service when a service duration is given', async () => {
    answer(SLOTS);
    renderPicker({ durationMin: 20 });

    await screen.findByTestId('slot-s-3');

    expect(screen.queryByTestId('slot-s-1')).not.toBeInTheDocument();
    expect(screen.getByText(/20 мин/)).toBeInTheDocument();
  });

  it('should explain that other services have time when none fits the chosen one', async () => {
    answer(SLOTS);
    renderPicker({ durationMin: 45 });

    expect(await screen.findByText('Нет времени для выбранной услуги')).toBeInTheDocument();
  });

  it('should say there is no time when the doctor has no slots at all', async () => {
    answer([]);
    renderPicker();

    expect(await screen.findByText('Нет свободного времени')).toBeInTheDocument();
  });

  it('should draw the slot another patient took as taken when the refetch has already dropped it', async () => {
    answer([SLOTS[1] as Slot]);
    renderPicker({ takenSlot: SLOTS[0] as Slot });

    const tile = await screen.findByTestId('slot-s-1');

    expect(tile).toHaveAttribute('data-state', 'taken');
    expect(tile).toHaveAttribute('aria-disabled', 'true');
    expect(tile).toHaveTextContent('только что занято');
  });

  it('should warn that not every slot is shown when the search was cut', async () => {
    answer(SLOTS, { truncated: true });
    renderPicker();

    expect(await screen.findByText(/Показаны не все слоты/)).toBeInTheDocument();
  });

  it('should show the real problem with its request id when the search fails, not a hard-coded error', async () => {
    const problem: ProblemDetails = { title: 'Bad Gateway', status: 502, errorCode: 'INTERNAL', requestId: 'req-42' };
    apiFetchMock.mockRejectedValue(new ApiError(problem));
    renderPicker();

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-42');
  });

  it('should search again when the visitor retries after a failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError({ title: 'x', status: 503, errorCode: 'INTERNAL' }));
    renderPicker();
    answer(SLOTS);

    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(await screen.findByTestId('slot-s-1')).toBeInTheDocument();
  });

  it('should search the next period when the visitor asks for later times', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');

    await userEvent.click(screen.getByRole('button', { name: 'Позже' }));

    const from: string = shiftDay(TODAY, SLOT_WINDOW_DAYS);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining(`from=${from}`)));
  });

  it('should not offer earlier times than today when the visitor asks for earlier periods', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');

    expect(screen.getByRole('button', { name: 'Раньше' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('should not search another period when the visitor presses earlier times while the picker is at today', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');
    const searches: number = apiFetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Раньше' }));

    expect(apiFetchMock.mock.calls).toHaveLength(searches);
  });

  it('should close later periods and say why when the picker is at the last day the API accepts', async () => {
    const last: string = shiftDay(TODAY, MAX_LOOKAHEAD_DAYS);
    answer([slot('s-last', last, 9, 30)]);
    renderPicker({ initialFrom: last });
    await screen.findByTestId('slot-s-last');
    const later: HTMLElement = screen.getByRole('button', { name: 'Позже' });

    await userEvent.click(later);

    expect(later).toHaveAttribute('aria-disabled', 'true');
    expect(later).toHaveAccessibleDescription('Это последний доступный период: поиск возможен не более чем на год вперёд.');
    expect(apiFetchMock.mock.calls.every(([path]) => !String(path).includes(`from=${shiftDay(last, SLOT_WINDOW_DAYS)}`))).toBe(true);
  });

  it('should keep focus on the earlier button when the visitor presses it at the first period', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');
    const earlier: HTMLElement = screen.getByRole('button', { name: 'Раньше' });

    await userEvent.click(earlier);

    expect(earlier).toHaveFocus();
  });

  it('should limit the date field to the last day the API accepts when the picker opens', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');

    expect(screen.getByLabelText('Перейти к дате')).toHaveAttribute('max', shiftDay(TODAY, MAX_LOOKAHEAD_DAYS));
  });

  it('should open the period of a restored selection when the selected slot lies in a later period', async () => {
    const later: string = shiftDay(TODAY, 20);
    answer([slot('s-far', later, 9, 30)]);
    renderPicker({ initialFrom: later });

    await screen.findByTestId('slot-s-far');

    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining(`from=${later}`));
  });

  it('should let the visitor jump to a date when one is typed', async () => {
    answer(SLOTS);
    renderPicker();
    await screen.findByTestId('slot-s-1');
    const target: string = shiftDay(TODAY, 10);

    fireEvent.change(screen.getByLabelText('Перейти к дате'), { target: { value: target } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining(`from=${target}`)));
  });
});
