import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useToastStore } from '@/store/use-toast-store';
import { setFlash } from '@/lib/ui/flash-message';
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
});
