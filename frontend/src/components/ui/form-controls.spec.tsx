import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import { Checkbox } from './checkbox';
import { FIELD_CLASS } from './field-styles';
import { Select } from './select';
import { Switch } from './switch';

describe('field look', () => {
  it('should be at least 44 px tall and use the soft halo instead of a thick outline when focused', () => {
    expect(FIELD_CLASS).toContain('min-h-[44px]');
    expect(FIELD_CLASS).toContain('focus:shadow-focus');
    expect(FIELD_CLASS).not.toMatch(/focus:ring-2|outline-2/);
  });
});

describe('Select', () => {
  it('should stay a native select with its label, options and value when it is themed', async () => {
    render(
      <>
        <label htmlFor="s">Пол</label>
        <Select id="s" defaultValue="">
          <option value="">Выберите…</option>
          <option value="f">Женский</option>
        </Select>
      </>,
    );

    await userEvent.selectOptions(screen.getByLabelText('Пол'), 'f');

    expect(screen.getByRole('combobox', { name: 'Пол' })).toHaveValue('f');
  });

  it('should pass the ref and the invalid state to the select when it is used with react-hook-form', () => {
    const ref = createRef<HTMLSelectElement>();
    render(<Select ref={ref} aria-label="Роль" aria-invalid="true"><option>a</option></Select>);

    expect(ref.current).toBe(screen.getByLabelText('Роль'));
    expect(ref.current).toHaveAttribute('aria-invalid', 'true');
  });

  it('should hide the decorative chevron from assistive technology when it draws the arrow', () => {
    const { container } = render(<Select aria-label="x"><option>a</option></Select>);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

function RoleForm({ onSubmit }: { readonly onSubmit: (values: unknown) => void }): ReactNode {
  const { register, handleSubmit } = useForm({ defaultValues: { roles: ['DOCTOR'], active: true } });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Checkbox value="ADMIN" {...register('roles')}>Администратор</Checkbox>
      <Checkbox value="DOCTOR" {...register('roles')}>Врач</Checkbox>
      <Switch {...register('active')}>Активен</Switch>
      <button type="submit">Отправить</button>
    </form>
  );
}

describe('Checkbox and Switch', () => {
  it('should expose native roles and the label text as the name when they carry text', () => {
    render(<RoleForm onSubmit={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Врач' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Активен' })).toBeChecked();
  });

  it('should toggle when the label text is clicked and register their values with react-hook-form', async () => {
    const onSubmit = jest.fn();
    render(<RoleForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByText('Администратор'));
    await userEvent.click(screen.getByText('Активен'));
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(onSubmit).toHaveBeenCalledWith({ roles: ['ADMIN', 'DOCTOR'], active: false }, expect.anything());
  });

  it('should toggle a switch with the Space key when it has the focus', async () => {
    render(<RoleForm onSubmit={jest.fn()} />);

    screen.getByRole('switch', { name: 'Активен' }).focus();
    await userEvent.keyboard(' ');

    expect(screen.getByRole('switch', { name: 'Активен' })).not.toBeChecked();
  });

  it('should render a bare box without a label row when no text is given', () => {
    render(<Checkbox aria-label="Согласен" />);

    expect(screen.getByRole('checkbox', { name: 'Согласен' })).toBeInTheDocument();
  });

  it('should give the labelled row a 44 px target when it has text', () => {
    render(<Checkbox>Текст</Checkbox>);

    expect(screen.getByText('Текст').closest('label')).toHaveClass('min-h-[44px]');
  });
});
