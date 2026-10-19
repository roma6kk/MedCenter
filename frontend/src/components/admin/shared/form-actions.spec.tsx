import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormActions } from './form-actions';
import { apiProblem } from './test-utils';

function renderForm(props: Partial<Parameters<typeof FormActions>[0]>, onSubmit: () => void): void {
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FormActions submitLabel="Сохранить" isPending={false} onCancel={jest.fn()} {...props} />
    </form>,
  );
}

describe('FormActions', () => {
  it('should submit the form when the submit button is pressed and nothing blocks it', async () => {
    const onSubmit = jest.fn();
    renderForm({}, onSubmit);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('should not submit again and keep the focus on the button when a request is already running', async () => {
    const onSubmit = jest.fn();
    renderForm({ isPending: true }, onSubmit);
    const button = screen.getByRole('button', { name: 'Сохраняем…' });
    button.focus();

    await userEvent.click(button);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
  });

  it('should keep the submit closed and show the seconds to wait when the last answer was 429 with Retry-After', async () => {
    const onSubmit = jest.fn();
    renderForm({ error: apiProblem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 9 }) }, onSubmit);

    await userEvent.click(screen.getByRole('button', { name: 'Повторите через 9 с.' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should stay open when the last failure was not a rate limit', async () => {
    const onSubmit = jest.fn();
    renderForm({ error: apiProblem({ status: 500, errorCode: 'INTERNAL' }) }, onSubmit);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('should explain the asterisk above the buttons when the form is shown', () => {
    renderForm({}, jest.fn());

    expect(screen.getByText('Поля, отмеченные звёздочкой (*), обязательны для заполнения.')).toBeInTheDocument();
  });
});
