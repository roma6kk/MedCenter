import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SlotPeriodControl } from './slot-period-control';
import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';
import { useSlotWindow } from './use-slot-window';

const TODAY: string = clinicDateKey();

function Harness(): ReactNode {
  const state = useSlotWindow();
  return (
    <>
      <SlotPeriodControl state={state} />
      <output data-testid="searched-from">{state.window.from}</output>
    </>
  );
}

function dateField(): HTMLInputElement {
  return screen.getByLabelText('Перейти к дате') as HTMLInputElement;
}

describe('SlotPeriodControl date field', () => {
  it('should keep the day typed so far when it is a past day that the search clamps to today', () => {
    render(<Harness />);
    const past: string = shiftDateKey(TODAY, -3);

    fireEvent.change(dateField(), { target: { value: past } });

    expect(dateField().value).toBe(past);
    expect(screen.getByTestId('searched-from')).toHaveTextContent(TODAY);
  });

  it('should search the day when typing ends on a later day', () => {
    render(<Harness />);
    const target: string = shiftDateKey(TODAY, 12);

    fireEvent.change(dateField(), { target: { value: shiftDateKey(TODAY, -3) } });
    fireEvent.change(dateField(), { target: { value: target } });

    expect(screen.getByTestId('searched-from')).toHaveTextContent(target);
    expect(dateField().value).toBe(target);
  });

  it('should show the searched day again when the field loses focus after a past day was typed', () => {
    render(<Harness />);

    fireEvent.change(dateField(), { target: { value: shiftDateKey(TODAY, -3) } });
    fireEvent.blur(dateField());

    expect(dateField().value).toBe(TODAY);
  });

  it('should follow the period when the visitor moves it with the later button', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Позже' }));

    expect(dateField().value).toBe(shiftDateKey(TODAY, 14));
  });
});
