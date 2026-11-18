import { render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('should be a modal dialog labelled by its title when it is shown', () => {
    render(<Dialog title="Новый кабинет" onClose={jest.fn()}><button type="button">Внутри</button></Dialog>);

    const dialog = screen.getByRole('dialog', { name: 'Новый кабинет' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should focus the first focusable element when it opens', () => {
    render(<Dialog title="T" onClose={jest.fn()}><input aria-label="Первое" /><button type="button">Второе</button></Dialog>);

    expect(screen.getByLabelText('Первое')).toHaveFocus();
  });

  it('should close when Escape is pressed', async () => {
    const onClose = jest.fn();
    render(<Dialog title="T" onClose={onClose}><button type="button">Внутри</button></Dialog>);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should keep Tab inside the dialog when the last element is focused', async () => {
    render(
      <>
        <button type="button">Снаружи</button>
        <Dialog title="T" onClose={jest.fn()}><button type="button">Первая</button><button type="button">Последняя</button></Dialog>
      </>,
    );

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus();
  });

  it('should keep the focus trap when the parent re-renders with a new onClose', async () => {
    const { rerender } = render(<Dialog title="T" onClose={jest.fn()}><input aria-label="Поле" /></Dialog>);
    await userEvent.type(screen.getByLabelText('Поле'), 'a');

    rerender(<Dialog title="T" onClose={jest.fn()}><input aria-label="Поле" /></Dialog>);

    expect(screen.getByLabelText('Поле')).toHaveFocus();
  });

  it('should stop the page behind from scrolling while it is open and let it scroll again when it closes', () => {
    const { unmount } = render(<Dialog title="T" onClose={jest.fn()}><button type="button">Внутри</button></Dialog>);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('should hold the focus on the dialog itself when its content is still loading', () => {
    render(<Dialog title="Загрузка" onClose={jest.fn()}><p>Загружаем…</p></Dialog>);

    expect(screen.getByRole('dialog', { name: 'Загрузка' })).toHaveFocus();
  });

  it('should move the focus to the first control when the content that was loading appears', () => {
    function Harness({ ready }: { readonly ready: boolean }): ReactNode {
      return <Dialog title="T" onClose={jest.fn()}>{ready ? <input aria-label="Врач" /> : <p>Загружаем…</p>}</Dialog>;
    }
    const { rerender } = render(<Harness ready={false} />);

    rerender(<Harness ready />);

    expect(screen.getByLabelText('Врач')).toHaveFocus();
  });

  it('should leave the focus where the user put it when a control has already taken it', async () => {
    render(<Dialog title="T" onClose={jest.fn()}><input aria-label="Первое" /><input aria-label="Второе" /></Dialog>);

    await userEvent.click(screen.getByLabelText('Второе'));

    expect(screen.getByLabelText('Второе')).toHaveFocus();
  });

  it('should put the focus on the page heading when the dialog closes and its opener is gone', async () => {
    function Page(): ReactNode {
      const [isOpen, setIsOpen] = useState(true);
      const [hasOpener, setHasOpener] = useState(true);
      return (
        <main>
          <h1>Кабинеты</h1>
          {hasOpener ? <button type="button">Удалить</button> : null}
          {isOpen ? (
            <Dialog title="Удаление" onClose={() => setIsOpen(false)}>
              <button type="button" onClick={() => { setHasOpener(false); setIsOpen(false); }}>Подтвердить</button>
            </Dialog>
          ) : null}
        </main>
      );
    }
    render(<Page />);

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(screen.getByRole('heading', { name: 'Кабинеты' })).toHaveFocus();
  });

  it('should close with its close button, which is named for assistive technology', async () => {
    const onClose = jest.fn();
    render(<Dialog title="T" onClose={onClose}><input aria-label="Поле" /></Dialog>);

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should keep the close button last in the tab order and give the first control of the body the initial focus', async () => {
    render(<Dialog title="T" onClose={jest.fn()}><input aria-label="Поле" /><button type="button">Действие</button></Dialog>);
    expect(screen.getByLabelText('Поле')).toHaveFocus();

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
  });

  it('should describe itself by its description and render the footer outside the scrolling body', () => {
    render(<Dialog title="T" description="Что делает окно" footer={<button type="button">Готово</button>} onClose={jest.fn()}><p>Тело</p></Dialog>);

    const dialog = screen.getByRole('dialog', { name: 'T' });

    expect(dialog).toHaveAccessibleDescription('Что делает окно');
    expect(screen.getByRole('button', { name: 'Готово' }).parentElement).not.toBe(screen.getByText('Тело').parentElement);
  });

  it('should be a bottom sheet below 640 px and a centred window from there up when it is a dialog', () => {
    render(<Dialog title="T" onClose={jest.fn()}><p>Тело</p></Dialog>);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('rounded-t-panel', 'animate-sheet-in', 'sm:animate-dialog-in', 'shadow-elev-3');
    expect(dialog.parentElement).toHaveClass('bg-scrim', 'backdrop-blur-sm', 'items-end', 'sm:items-center');
  });

  it('should be a panel on the right edge when it is a drawer', () => {
    render(<Dialog title="T" variant="drawer" onClose={jest.fn()}><p>Тело</p></Dialog>);

    expect(screen.getByRole('dialog')).toHaveClass('animate-drawer-in', 'max-w-sm');
  });

  it('should be a panel on the left edge when it is a left drawer, for a burger that sits on the left', () => {
    render(<Dialog title="T" variant="drawer-left" onClose={jest.fn()}><p>Тело</p></Dialog>);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('animate-drawer-left-in', 'max-w-sm', 'border-r');
    expect(dialog.parentElement).toHaveClass('justify-start');
  });

  it('should return the focus to the opener when it closes', async () => {
    function Page(): ReactNode {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Открыть</button>
          {isOpen ? <Dialog title="T" onClose={() => setIsOpen(false)}><button type="button">Внутри</button></Dialog> : null}
        </>
      );
    }
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });
});
