import { render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { Modal } from './modal';

describe('Modal', () => {
  it('should be a modal dialog labelled by its title when it is shown', () => {
    render(<Modal title="Новый кабинет" onClose={jest.fn()}><button type="button">Внутри</button></Modal>);

    const dialog = screen.getByRole('dialog', { name: 'Новый кабинет' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should focus the first focusable element when it opens', () => {
    render(<Modal title="T" onClose={jest.fn()}><input aria-label="Первое" /><button type="button">Второе</button></Modal>);

    expect(screen.getByLabelText('Первое')).toHaveFocus();
  });

  it('should close when Escape is pressed', async () => {
    const onClose = jest.fn();
    render(<Modal title="T" onClose={onClose}><button type="button">Внутри</button></Modal>);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should keep Tab inside the dialog when the last element is focused', async () => {
    render(
      <>
        <button type="button">Снаружи</button>
        <Modal title="T" onClose={jest.fn()}><button type="button">Первая</button><button type="button">Последняя</button></Modal>
      </>,
    );

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus();
  });

  it('should keep the focus trap when the parent re-renders with a new onClose', async () => {
    const { rerender } = render(<Modal title="T" onClose={jest.fn()}><input aria-label="Поле" /></Modal>);
    await userEvent.type(screen.getByLabelText('Поле'), 'a');

    rerender(<Modal title="T" onClose={jest.fn()}><input aria-label="Поле" /></Modal>);

    expect(screen.getByLabelText('Поле')).toHaveFocus();
  });

  it('should stop the page behind from scrolling while it is open and let it scroll again when it closes', () => {
    const { unmount } = render(<Modal title="T" onClose={jest.fn()}><button type="button">Внутри</button></Modal>);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('should hold the focus on the dialog itself when its content is still loading', () => {
    render(<Modal title="Загрузка" onClose={jest.fn()}><p>Загружаем…</p></Modal>);

    expect(screen.getByRole('dialog', { name: 'Загрузка' })).toHaveFocus();
  });

  it('should move the focus to the first control when the content that was loading appears', () => {
    function Harness({ ready }: { readonly ready: boolean }): ReactNode {
      return <Modal title="T" onClose={jest.fn()}>{ready ? <input aria-label="Врач" /> : <p>Загружаем…</p>}</Modal>;
    }
    const { rerender } = render(<Harness ready={false} />);

    rerender(<Harness ready />);

    expect(screen.getByLabelText('Врач')).toHaveFocus();
  });

  it('should leave the focus where the user put it when a control has already taken it', async () => {
    render(<Modal title="T" onClose={jest.fn()}><input aria-label="Первое" /><input aria-label="Второе" /></Modal>);

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
            <Modal title="Удаление" onClose={() => setIsOpen(false)}>
              <button type="button" onClick={() => { setHasOpener(false); setIsOpen(false); }}>Подтвердить</button>
            </Modal>
          ) : null}
        </main>
      );
    }
    render(<Page />);

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(screen.getByRole('heading', { name: 'Кабинеты' })).toHaveFocus();
  });
});
