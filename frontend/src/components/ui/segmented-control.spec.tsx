import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { SegmentedControl } from './segmented-control';

const OPTIONS = [
  { value: 'ru', label: 'ru' },
  { value: 'en', label: 'en' },
] as const;

function Harness({ kind }: { readonly kind: 'tabs' | 'toggle' }): ReactNode {
  const [value, setValue] = useState<'ru' | 'en'>('ru');
  return <SegmentedControl kind={kind} label="Язык" options={OPTIONS} value={value} onChange={setValue} />;
}

describe('SegmentedControl', () => {
  it('should be a tab list of tabs when it switches a panel', () => {
    render(<Harness kind="tabs" />);

    expect(screen.getByRole('tablist', { name: 'Язык' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ru' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should be a group of pressed-state buttons when it is a toggle', async () => {
    render(<Harness kind="toggle" />);

    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ru' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByRole('button', { name: 'en' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ru' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should draw one sliding indicator that is decoration only', () => {
    render(<Harness kind="tabs" />);

    const indicator = screen.getByTestId('segmented-indicator');

    expect(indicator).toHaveAttribute('aria-hidden', 'true');
    expect(indicator).toHaveClass('rounded-control', 'shadow-elev-1');
  });

  it('should move the selection with the arrow keys when it is a tab list', async () => {
    render(<Harness kind="tabs" />);
    screen.getByRole('tab', { name: 'ru' }).focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'en' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'en' })).toHaveFocus();
  });

  it('should slide the indicator under the selected segment when the selection changes', async () => {
    const offsets: Record<string, number> = { ru: 0, en: 60 };
    jest.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
      return offsets[this.textContent ?? ''] ?? 0;
    });
    jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(56);
    render(<Harness kind="toggle" />);
    expect(screen.getByTestId('segmented-indicator').style.transform).toBe('translate(0px, 0px)');

    await userEvent.click(screen.getByRole('button', { name: 'en' }));

    expect(screen.getByTestId('segmented-indicator').style.transform).toBe('translate(60px, 0px)');
    jest.restoreAllMocks();
  });
});
