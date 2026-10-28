import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';

jest.mock('@/lib/clinic-time', () => {
  const actual = jest.requireActual('@/lib/clinic-time');
  return { ...actual, formatClinicTime: jest.fn(actual.formatClinicTime) };
});

import type { Slot } from '@/components/catalog/catalog-types';
import { SlotGrid } from './slot-grid';
import { formatClinicTime } from '@/lib/clinic-time';

const formatMock = formatClinicTime as jest.MockedFunction<typeof formatClinicTime>;

/** One clinic day of 16 half-hour slots, 08:00–15:30 Minsk. */
const SLOTS: ReadonlyArray<Slot> = Array.from({ length: 16 }, (_, index) => {
  const start: number = Date.parse('2026-10-19T05:00:00.000Z') + index * 30 * 60_000;
  return { id: `s-${index}`, start: new Date(start).toISOString(), end: new Date(start + 30 * 60_000).toISOString(), status: 'free' };
});

/** Holds the selection like the wizard does: `onSelect` is a new closure on every render. */
function Harness(): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  return <SlotGrid slots={SLOTS} selectedSlotId={selected} takenSlotId={null} showDuration={false} onSelect={(slot) => setSelected(slot.id)} />;
}

describe('SlotGrid', () => {
  beforeEach(() => formatMock.mockClear());

  it('should render only the chips whose selection changed when the visitor selects a slot', async () => {
    render(<Harness />);
    expect(formatMock).toHaveBeenCalledTimes(SLOTS.length);
    formatMock.mockClear();

    await userEvent.click(screen.getByTestId('slot-s-3'));
    // The chip that became chosen renders again; focus moving to it may re-render the chip that held the tab stop.
    expect(formatMock.mock.calls.length).toBeLessThanOrEqual(3);

    formatMock.mockClear();
    await userEvent.click(screen.getByTestId('slot-s-10'));
    expect(formatMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('should construct no Intl.DateTimeFormat when the visitor selects a slot', async () => {
    render(<Harness />);
    const construct = jest.spyOn(Intl, 'DateTimeFormat');

    await userEvent.click(screen.getByTestId('slot-s-3'));

    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();
  });

  it('should mark exactly the chosen slot as pressed when the selection moves', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByTestId('slot-s-3'));
    await userEvent.click(screen.getByTestId('slot-s-10'));

    expect(screen.getAllByRole('button', { pressed: true })).toEqual([screen.getByTestId('slot-s-10')]);
  });

  it('should hand the latest handler to a chip when the parent passes a new one', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<SlotGrid slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration={false} onSelect={first} />);

    rerender(<SlotGrid slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration={false} onSelect={second} />);
    await userEvent.click(screen.getByTestId('slot-s-5'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ id: 's-5' }));
  });

  it('should show the length on a chip only when no service fixes it', () => {
    const { rerender } = render(<SlotGrid slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration={false} onSelect={jest.fn()} />);
    expect(screen.getByTestId('slot-s-0')).not.toHaveTextContent('30 мин');

    rerender(<SlotGrid slots={SLOTS} selectedSlotId={null} takenSlotId={null} showDuration onSelect={jest.fn()} />);

    expect(screen.getByTestId('slot-s-0')).toHaveTextContent('30 мин');
  });
});
