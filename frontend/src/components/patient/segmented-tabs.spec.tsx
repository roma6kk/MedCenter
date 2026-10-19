import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { SegmentedTabs, tabPanelProps, type TabOption } from './segmented-tabs';

type Tab = 'upcoming' | 'all' | 'past';

const OPTIONS: ReadonlyArray<TabOption<Tab>> = [
  { value: 'upcoming', label: 'Предстоящие' },
  { value: 'all', label: 'Все записи' },
  { value: 'past', label: 'Прошедшие' },
];

function Harness({ onChange }: { readonly onChange?: (value: Tab) => void }): ReactNode {
  const [value, setValue] = useState<Tab>('upcoming');
  return (
    <>
      <SegmentedTabs idPrefix="appts" label="Список записей" options={OPTIONS} value={value} onChange={(next) => { setValue(next); onChange?.(next); }} />
      <div {...tabPanelProps('appts', value)}>панель {value}</div>
    </>
  );
}

describe('SegmentedTabs', () => {
  it('should expose a labelled tab list whose selected tab controls the panel', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'Список записей' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Предстоящие' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Все записи' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Предстоящие');
  });

  it('should keep only the selected tab in the tab order when the page loads', () => {
    render(<Harness />);

    expect(screen.getByRole('tab', { name: 'Предстоящие' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Все записи' })).toHaveAttribute('tabindex', '-1');
  });

  it('should select a tab when it is clicked', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    expect(onChange).toHaveBeenCalledWith('all');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('панель all');
  });

  it('should move the selection and the focus to the next tab when ArrowRight is pressed', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Предстоящие' }).focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Все записи' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Все записи' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should wrap to the last tab when ArrowLeft is pressed on the first tab', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Предстоящие' }).focus();

    await userEvent.keyboard('{ArrowLeft}');

    expect(screen.getByRole('tab', { name: 'Прошедшие' })).toHaveFocus();
  });

  it('should jump to the ends when Home and End are pressed', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Предстоящие' }).focus();

    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Прошедшие' })).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Предстоящие' })).toHaveFocus();
  });
});
