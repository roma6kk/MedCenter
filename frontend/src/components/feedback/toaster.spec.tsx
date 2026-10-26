import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useToastStore } from '@/store/use-toast-store';
import { setFlash } from '@/lib/ui/flash-message';
import { showToast } from '@/lib/ui/toast';
import { Toaster } from './toaster';

describe('Toaster', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should keep both live regions in the DOM before any message arrives', () => {
    render(<Toaster />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should announce an info toast politely and an error toast assertively', () => {
    render(<Toaster />);

    act(() => {
      useToastStore.getState().push({ tone: 'info', message: 'Слот уже занят' });
      useToastStore.getState().push({ tone: 'error', message: 'Нет связи с сервером' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Слот уже занят');
    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером');
  });

  it('should dismiss a toast with its close button', async () => {
    render(<Toaster />);
    act(() => useToastStore.getState().push({ tone: 'info', message: 'Готово' }));

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));

    expect(screen.queryByText('Готово')).not.toBeInTheDocument();
  });

  it('should dismiss an info toast by itself after six seconds', () => {
    jest.useFakeTimers();
    render(<Toaster />);
    act(() => useToastStore.getState().push({ tone: 'info', message: 'Готово' }));

    act(() => {
      jest.advanceTimersByTime(6_000);
    });

    expect(screen.queryByText('Готово')).not.toBeInTheDocument();
  });

  it('should keep an error toast longer than an info toast', () => {
    jest.useFakeTimers();
    render(<Toaster />);
    act(() => useToastStore.getState().push({ tone: 'error', message: 'Сбой' }));

    act(() => {
      jest.advanceTimersByTime(6_000);
    });

    expect(screen.getByText('Сбой')).toBeInTheDocument();
  });

  it('should show the "session ended" toast left by the previous page', () => {
    setFlash('session-ended');

    render(<Toaster />);

    expect(screen.getByRole('status')).toHaveTextContent('Сессия завершена, войдите снова');
  });

  it('should show the tone as an icon next to the words, never as a colour alone', () => {
    render(<Toaster />);

    act(() => {
      useToastStore.getState().push({ tone: 'success', message: 'Сохранено' });
      useToastStore.getState().push({ tone: 'error', message: 'Сбой' });
    });

    expect(screen.getByTestId('toast-success').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('toast-error').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('toast-success')).toHaveClass('animate-toast-in');
  });

  it('should run the action of a toast once and close the toast when its button is pressed', async () => {
    const onAction = jest.fn();
    render(<Toaster />);
    act(() => useToastStore.getState().push({ tone: 'success', message: 'Отмечено', action: { label: 'Отменить', onAction } }));

    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Отмечено')).not.toBeInTheDocument();
  });

  it('should keep a toast with an action on screen longer than a plain one so there is time to press it', () => {
    jest.useFakeTimers();
    render(<Toaster />);
    act(() => useToastStore.getState().push({ tone: 'success', message: 'Отмечено', action: { label: 'Отменить', onAction: jest.fn() } }));

    act(() => {
      jest.advanceTimersByTime(6_000);
    });
    expect(screen.getByText('Отмечено')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.queryByText('Отмечено')).not.toBeInTheDocument();
  });

  it('should translate the message and the button label when a toast with an action is raised from code', async () => {
    const onAction = jest.fn();
    render(<Toaster />);

    act(() => showToast('success', 'doctor.noshow.done', undefined, { labelKey: 'common.cancel', onAction }));

    expect(screen.getByRole('status')).toHaveTextContent('Неявка отмечена');
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
