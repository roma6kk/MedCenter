import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { useDialogFocus } from './use-dialog-focus';

function Harness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogFocus<HTMLDivElement>(open, close);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Открыть</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Тестовый диалог">
          <div ref={dialogRef}>
            <button type="button">Первая</button>
            <button type="button" onClick={close}>Закрыть</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

describe('useDialogFocus', () => {
  it('should focus the first control when the dialog opens', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus();
  });

  it('should close the dialog on Escape and return focus to the trigger', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });

  it('should trap Tab inside the dialog', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    const first = screen.getByRole('button', { name: 'Первая' });
    const last = screen.getByRole('button', { name: 'Закрыть' });
    expect(first).toHaveFocus();

    last.focus();
    await user.keyboard('{Tab}');
    expect(first).toHaveFocus();

    first.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(last).toHaveFocus();
  });
});
