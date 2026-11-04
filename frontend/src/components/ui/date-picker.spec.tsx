import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { clinicDateKey } from '@/lib/clinic-time';
import { useUiStore } from '@/store/use-ui-store';
import { DatePicker } from './date-picker';

interface HarnessProps {
  readonly initial?: string;
  readonly min?: string;
  readonly max?: string;
  readonly describedBy?: string;
  readonly onChange?: (value: string) => void;
}

function Harness({ initial = '', min, max, describedBy, onChange }: HarnessProps): ReactNode {
  const [value, setValue] = useState<string>(initial);
  return (
    <>
      <label htmlFor="d">Дата</label>
      <DatePicker
        id="d"
        value={value}
        min={min}
        max={max}
        aria-describedby={describedBy}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <button type="button" onClick={() => setValue('2026-01-05')}>Сбросить</button>
      <output data-testid="value">{value}</output>
    </>
  );
}

beforeEach(() => useUiStore.setState({ locale: 'ru' }));

const field = (): HTMLInputElement => screen.getByLabelText('Дата') as HTMLInputElement;
const openButton = (): HTMLElement => screen.getByRole('button', { name: 'Выбрать дату в календаре' });

describe('DatePicker text field', () => {
  it('should show the day day-first and keep the ISO day as the value when the form already holds one', () => {
    render(<Harness initial="2026-10-27" />);

    expect(field()).toHaveValue('27.10.2026');
    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-27');
  });

  it('should report an ISO day when a day is typed as dd.mm.yyyy', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(field(), '27.10.2026');

    expect(onChange).toHaveBeenLastCalledWith('2026-10-27');
  });

  it('should report an ISO day when an ISO day is typed or pasted', () => {
    render(<Harness />);

    fireEvent.change(field(), { target: { value: '2026-03-05' } });

    expect(screen.getByTestId('value')).toHaveTextContent('2026-03-05');
  });

  it('should report an empty value while the text is not a day and mark the field when the visitor leaves it', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.clear(field());
    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    expect(screen.getByTestId('value')).toHaveTextContent(/^$/);
    expect(field()).toHaveValue('31.02.2026');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('should empty the value when the text is cleared', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.clear(field());

    expect(screen.getByTestId('value')).toHaveTextContent(/^$/);
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('should write a typed ISO day in the standard form when the field loses focus', async () => {
    render(<Harness />);

    await userEvent.type(field(), '2026-03-05');
    await userEvent.tab();

    expect(field()).toHaveValue('05.03.2026');
  });

  it('should follow the value when it changes from outside', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(field()).toHaveValue('05.01.2026');
  });

  it('should keep the narrow width of a date when no width is given', () => {
    const { container } = render(<Harness />);

    expect(container.querySelector('.max-w-\\[12rem\\]')).not.toBeNull();
  });
});

describe('DatePicker unreadable text (WCAG 3.3.1, 1.4.1)', () => {
  const MESSAGE = 'Не похоже на дату. Формат: дд.мм.гггг';

  it('should not explain the text while it is still being typed, since every half-typed date is not a day yet', async () => {
    render(<Harness />);

    await userEvent.type(field(), '31.0');

    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should refuse a typed day after max, report an empty value and explain it when the field is left', async () => {
    const onChange = jest.fn();
    render(<Harness max="2026-10-29" onChange={onChange} />);

    await userEvent.type(field(), '01.01.2090');
    expect(onChange).not.toHaveBeenCalledWith('2090-01-01');
    await userEvent.tab();

    expect(screen.getByTestId('value')).toHaveTextContent(/^$/);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Дата не позже 29.10.2026');
  });

  it('should refuse a typed day before min and name the earliest day', async () => {
    render(<Harness min="2026-10-20" />);

    await userEvent.type(field(), '19.10.2026');
    await userEvent.tab();

    expect(screen.getByTestId('value')).toHaveTextContent(/^$/);
    expect(screen.getByRole('alert')).toHaveTextContent('Дата не раньше 20.10.2026');
  });

  it('should accept a typed day on the edge of min and max', async () => {
    render(<Harness min="2026-10-20" max="2026-10-29" />);

    await userEvent.type(field(), '29.10.2026');
    await userEvent.tab();

    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-29');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should say what is wrong and which form is read when the visitor leaves the field with a text that is not a day', async () => {
    render(<Harness />);

    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
    expect(field()).toHaveAccessibleDescription(MESSAGE);
  });

  it('should say it when Enter is pressed with a text that is not a day, before the field is left', async () => {
    render(<Harness />);

    await userEvent.type(field(), '31.02.2026{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
    expect(field()).toHaveFocus();
  });

  it('should keep the description the caller gave next to the explanation', async () => {
    render(<Harness describedBy="hint" />);
    expect(field()).toHaveAttribute('aria-describedby', 'hint');

    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    expect(field().getAttribute('aria-describedby')).toMatch(/^hint \S+-unreadable$/);
  });

  it('should keep the explanation while the text is corrected and drop it once the text is a day', async () => {
    render(<Harness />);
    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    fireEvent.change(field(), { target: { value: '31.02.202' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: '27.10.2026' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).not.toHaveAttribute('aria-describedby');
  });

  it('should drop the explanation when the text is cleared', async () => {
    render(<Harness />);
    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    await userEvent.clear(field());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should be silent again for the next half-typed text once a day was picked in the calendar', async () => {
    render(<Harness />);
    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(openButton());
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.type(field(), '{Backspace}');

    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should keep the calendar button in the box of the field, so the line under the field does not pull it down', async () => {
    render(<Harness />);

    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    const box = openButton().parentElement as HTMLElement;
    expect(box).toContainElement(field());
    expect(box).not.toContainElement(screen.getByRole('alert'));
  });

  it('should explain it in English when the language is English', async () => {
    useUiStore.setState({ locale: 'en' });
    render(<Harness />);

    await userEvent.type(field(), '31.02.2026');
    await userEvent.tab();

    expect(screen.getByRole('alert')).toHaveTextContent('Not a valid date. Format: dd.mm.yyyy');
  });
});

describe('DatePicker calendar', () => {
  it('should open a labelled grid of the month of the current value when the button is pressed', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());

    const grid = screen.getByRole('grid', { name: 'Календарь: октябрь 2026' });
    expect(within(grid).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']);
    expect(openButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('should mark the current value as the selected cell and give it the focus when the calendar opens', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());

    const day = screen.getByRole('button', { name: '27 октября 2026 г.' });
    expect(day.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    expect(day).toHaveFocus();
  });

  it('should pick the day and close the calendar when a day is clicked', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.click(screen.getByRole('button', { name: '15 октября 2026 г.' }));

    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-15');
    expect(field()).toHaveValue('15.10.2026');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('should move the focused day with the arrow keys and pick it with Enter when the keyboard is used', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}');

    expect(screen.getByTestId('value')).toHaveTextContent('2026-11-04');
  });

  it.each([
    ['{ArrowLeft}', '2026-10-26'],
    ['{ArrowUp}', '2026-10-20'],
    ['{Home}', '2026-10-26'],
    ['{End}', '2026-11-01'],
    ['{PageUp}', '2026-09-27'],
    ['{PageDown}', '2026-11-27'],
    ['{Shift>}{PageDown}{/Shift}', '2027-10-27'],
  ])('should move to the right day when %s is pressed in the grid', async (keys, expected) => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.keyboard(`${keys}{Enter}`);

    expect(screen.getByTestId('value')).toHaveTextContent(expected);
  });

  it('should close the calendar and return the focus to the field when Escape is pressed', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-27');
  });

  it('should close the calendar when a click lands outside it', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.click(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should open with Alt+ArrowDown from the text field', async () => {
    render(<Harness initial="2026-10-27" />);

    field().focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(screen.getByRole('dialog', { name: 'Выбор даты' })).toBeInTheDocument();
  });

  it('should disable the days outside min and max and never move the cursor onto them', async () => {
    render(<Harness initial="2026-10-27" min="2026-10-20" max="2026-10-29" />);

    await userEvent.click(openButton());

    expect(screen.getByRole('button', { name: '19 октября 2026 г.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '30 октября 2026 г.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '29 октября 2026 г.' })).toBeEnabled();
    await userEvent.keyboard('{PageDown}{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-29');
  });

  it('should change the month with the month buttons and the selects without taking the focus from them', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(screen.getByRole('grid', { name: 'Календарь: ноябрь 2026' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Год'), '1990');
    await userEvent.selectOptions(screen.getByLabelText('Месяц'), 'март');

    expect(screen.getByRole('grid', { name: 'Календарь: март 1990' })).toBeInTheDocument();
    expect(screen.getByLabelText('Месяц')).toHaveFocus();
  });

  it('should pick today when the today button is pressed', async () => {
    render(<Harness />);

    await userEvent.click(openButton());
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));

    expect(screen.getByTestId('value')).toHaveTextContent(clinicDateKey());
  });

  it('should keep Tab inside the calendar when the last control is reached', async () => {
    render(<Harness initial="2026-10-27" />);

    await userEvent.click(openButton());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveFocus();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toHaveFocus();
  });
});
