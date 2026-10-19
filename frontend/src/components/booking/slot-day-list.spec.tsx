import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';

jest.mock('./slot-time', () => {
  const actual = jest.requireActual('./slot-time');
  return { ...actual, groupSlotsByDay: jest.fn(actual.groupSlotsByDay), formatSlotTime: jest.fn(actual.formatSlotTime) };
});

import type { Slot } from '@/components/catalog/catalog-types';
import { SlotDayList } from './slot-day-list';
import { formatSlotTime, groupSlotsByDay, shiftDay } from './slot-time';

const groupMock = groupSlotsByDay as jest.MockedFunction<typeof groupSlotsByDay>;
const formatMock = formatSlotTime as jest.MockedFunction<typeof formatSlotTime>;

/** 14 days of 16 half-hour slots: what a doctor page shows for two weeks. */
const SLOTS: ReadonlyArray<Slot> = Array.from({ length: 224 }, (_, index) => {
  const dayStart: number = Date.parse(`${shiftDay('2026-10-19', Math.floor(index / 16))}T05:00:00.000Z`);
  const start: number = dayStart + (index % 16) * 30 * 60_000;
  return { id: `s-${index}`, start: new Date(start).toISOString(), end: new Date(start + 30 * 60_000).toISOString(), status: 'free' };
});

/** Holds the selection like the wizard does: `onSelect` is a new closure on every render. */
function Harness({ slots }: { readonly slots: ReadonlyArray<Slot> }): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  return <SlotDayList slots={slots} selectedSlotId={selected} takenSlotId={null} showDuration={false} onSelect={(slot) => setSelected(slot.id)} />;
}

describe('SlotDayList rendering cost', () => {
  beforeEach(() => {
    groupMock.mockClear();
    formatMock.mockClear();
  });

  it('should group the slots once when the visitor selects slots one after another', async () => {
    render(<Harness slots={SLOTS} />);

    await userEvent.click(screen.getByTestId('slot-s-3'));
    await userEvent.click(screen.getByTestId('slot-s-40'));

    expect(groupMock).toHaveBeenCalledTimes(1);
  });

  it('should render only the tiles whose selection changed when the visitor selects a slot', async () => {
    render(<Harness slots={SLOTS} />);
    expect(formatMock).toHaveBeenCalledTimes(SLOTS.length);
    formatMock.mockClear();

    await userEvent.click(screen.getByTestId('slot-s-3'));
    expect(formatMock).toHaveBeenCalledTimes(1);

    formatMock.mockClear();
    await userEvent.click(screen.getByTestId('slot-s-40'));
    expect(formatMock).toHaveBeenCalledTimes(2);
  });

  it('should construct no Intl.DateTimeFormat when the visitor selects a slot', async () => {
    render(<Harness slots={SLOTS} />);
    const construct = jest.spyOn(Intl, 'DateTimeFormat');

    await userEvent.click(screen.getByTestId('slot-s-3'));

    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();
  });

  it('should still mark exactly the chosen slot as pressed when the selection moves', async () => {
    render(<Harness slots={SLOTS} />);

    await userEvent.click(screen.getByTestId('slot-s-3'));
    await userEvent.click(screen.getByTestId('slot-s-40'));

    expect(screen.getAllByRole('button', { pressed: true })).toEqual([screen.getByTestId('slot-s-40')]);
  });

  it('should hand the latest handler to a tile when the parent passes a new one', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<SlotDayList slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration={false} onSelect={first} />);

    rerender(<SlotDayList slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration={false} onSelect={second} />);
    await userEvent.click(screen.getByTestId('slot-s-5'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ id: 's-5' }));
  });
});
