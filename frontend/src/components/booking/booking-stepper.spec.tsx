import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingStepper } from './booking-stepper';

describe('BookingStepper', () => {
  it('should mark the current step and leave later steps inert when the wizard is on the slot step', () => {
    render(<BookingStepper current={3} onGo={jest.fn()} />);

    expect(screen.getByText('Время', { selector: 'span' }).closest('[aria-current="step"]')).not.toBeNull();
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
    expect(button.textContent?.trim()).toBe('Услуга');
    expect(name.startsWith('1 Услуга')).toBe(true);
  });

  it('should draw a check mark on passed steps, the number on the current one and the number on later ones', () => {
    render(<BookingStepper current={3} onGo={jest.fn()} />);

    expect(screen.getByTestId('step-marker-1')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('step-marker-1')).not.toHaveTextContent('1');
    expect(screen.getByTestId('step-marker-3')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('step-marker-3')).toHaveTextContent('3');
    expect(screen.getByTestId('step-marker-4')).toHaveAttribute('data-state', 'next');
  });

  it.each([
    [1, '25%'],
    [2, '50%'],
    [4, '100%'],
  ])('should fill the progress line up to the end of step %i when it is the current one', (step, width) => {
    render(<BookingStepper current={step as 1 | 2 | 4} onGo={jest.fn()} />);

    expect(screen.getByTestId('stepper-progress')).toHaveStyle({ width });
  });

  it('should animate the width of the progress line with the motion tokens and not transition every property', () => {
    render(<BookingStepper current={2} onGo={jest.fn()} />);

    expect(screen.getByTestId('stepper-progress').className).toMatch(/transition-\[width\].*duration-slow.*ease-out/);
  });

  it('should write the label of the current step under the line for a phone, where the labels of the row do not fit', () => {
    render(<BookingStepper current={3} onGo={jest.fn()} />);

    expect(screen.getByTestId('stepper-current-label')).toHaveTextContent('Время');
    expect(screen.getByTestId('stepper-current-label')).toHaveClass('sm:hidden');
  });

  it('should report the chosen step when an earlier step is activated', async () => {
    const onGo = jest.fn();
    render(<BookingStepper current={4} onGo={onGo} />);

    await userEvent.click(screen.getByRole('button', { name: /^2 Врач/ }));

    expect(onGo).toHaveBeenCalledWith(2);
  });
});
