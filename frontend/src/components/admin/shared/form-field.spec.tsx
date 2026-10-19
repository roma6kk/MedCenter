import { render, screen } from '@testing-library/react';
import { controlProps, Field, Fieldset } from './form-field';

describe('Field', () => {
  it('should mark the control aria-required when the field is required', () => {
    render(
      <Field id="name" label="Название" required>
        <input {...controlProps('name')} />
      </Field>,
    );

    expect(screen.getByLabelText(/Название/)).toHaveAttribute('aria-required', 'true');
  });

  it('should hide the asterisk from screen readers when the field is required', () => {
    render(
      <Field id="name" label="Название" required>
        <input {...controlProps('name')} />
      </Field>,
    );

    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('should leave the control without aria-required when the field is optional', () => {
    render(
      <Field id="note" label="Заметка">
        <input {...controlProps('note')} />
      </Field>,
    );

    expect(screen.getByLabelText('Заметка')).not.toHaveAttribute('aria-required');
  });

  it('should tie the hint and the error to the control when both are given', () => {
    render(
      <Field id="code" label="Код" hint="Например 10001" error="Нет такого кода">
        <input {...controlProps('code', 'Нет такого кода', 'Например 10001')} />
      </Field>,
    );

    const control = screen.getByLabelText('Код');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription('Например 10001 Нет такого кода');
  });
});

describe('Fieldset', () => {
  it('should describe the group by its error when the group is invalid', () => {
    render(
      <Fieldset id="roles" legend="Роли" error="Выберите хотя бы одну роль">
        <label>
          <input type="checkbox" /> Врач
        </label>
      </Fieldset>,
    );

    expect(screen.getByRole('group', { name: 'Роли' })).toHaveAccessibleDescription('Выберите хотя бы одну роль');
  });

  it('should not describe the group when it has no error', () => {
    render(
      <Fieldset id="roles" legend="Роли">
        <label>
          <input type="checkbox" /> Врач
        </label>
      </Fieldset>,
    );

    expect(screen.getByRole('group', { name: 'Роли' })).not.toHaveAttribute('aria-describedby');
  });
});
