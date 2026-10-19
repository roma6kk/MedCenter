import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingStepper } from './booking-stepper';

describe('BookingStepper', () => {
  it('should mark the current step and leave later steps inert when the wizard is on the slot step', () => {
    render(<BookingStepper current={3} onGo={jest.fn()} />);

    expect(screen.getByText('Время').closest('[aria-current="step"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Подтверждение/ })).toBeNull();
  });

  it('should offer a button for every earlier step when the wizard is past them', () => {
    render(<BookingStepper current={3} onGo={jest.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('should start the accessible name with the visible number and label when the step can be revisited', () => {
    render(<BookingStepper current={2} onGo={jest.fn()} />);

    // WCAG 2.5.3 (label in name): the words a sighted user reads on the button are inside its accessible name.
    const button: HTMLElement = screen.getByRole('button', { name: /Услуга/ });
    const name: string = button.getAttribute('aria-label') ?? '';
    expect(button.textContent).toBe('1 Услуга');
    expect(name.startsWith('1 Услуга')).toBe(true);
  });

  it('should report the chosen step when an earlier step is activated', async () => {
    const onGo = jest.fn();
    render(<BookingStepper current={4} onGo={onGo} />);

    await userEvent.click(screen.getByRole('button', { name: /^2 Врач/ }));

    expect(onGo).toHaveBeenCalledWith(2);
  });
});
