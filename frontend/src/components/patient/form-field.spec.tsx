import { render, screen } from '@testing-library/react';
import { FormField, describedBy } from './form-field';

function renderField(props: { error?: string; hint?: string } = {}): void {
  render(
    <FormField id="email" label="Email" {...props}>
      {(control) => <input {...control} />}
    </FormField>,
  );
}

describe('describedBy', () => {
  it('should join the present ids and skip the missing ones', () => {
    expect(describedBy('a', false, undefined, 'b')).toBe('a b');
  });

  it('should be undefined when nothing describes the control', () => {
    expect(describedBy(false, undefined)).toBeUndefined();
  });
});

describe('FormField', () => {
  it('should label the control so it is reachable by its name', () => {
    renderField();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('should link a hint to the control and keep it valid', () => {
    renderField({ hint: 'От 3 до 500' });

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('От 3 до 500');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('should announce an error as an alert linked to the control', () => {
    renderField({ error: 'Поле обязательно' });

    expect(screen.getByRole('alert')).toHaveTextContent('Поле обязательно');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Поле обязательно');
  });

  it('should translate a validation message key', () => {
    renderField({ error: 'validation.required' });

    expect(screen.getByRole('alert')).toHaveTextContent('Поле обязательно для заполнения');
  });
});
