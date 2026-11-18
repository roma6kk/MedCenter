import { act, render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { LoadingNote, SLOW_LOADING_MS } from './loading-note';

describe('LoadingNote', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useUiStore.setState({ locale: 'ru' });
  });
  afterEach(() => jest.useRealTimers());

  it('should say nothing while the wait is short', () => {
    render(<LoadingNote />);

    act(() => {
      jest.advanceTimersByTime(SLOW_LOADING_MS - 1);
    });

    expect(screen.queryByText('Загружаем…')).not.toBeInTheDocument();
  });

  it('should say that it is still loading when the wait passes three seconds', () => {
    render(<LoadingNote />);

    act(() => {
      jest.advanceTimersByTime(SLOW_LOADING_MS);
    });

    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
  });

  it('should keep counting while it is quiet and speak at once when it is allowed to', () => {
    const { rerender } = render(<LoadingNote quiet />);

    act(() => {
      jest.advanceTimersByTime(SLOW_LOADING_MS);
    });
    expect(screen.queryByText('Загружаем…')).not.toBeInTheDocument();

    rerender(<LoadingNote />);

    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
  });

  it('should be in English when the locale is English', () => {
    useUiStore.setState({ locale: 'en' });
    render(<LoadingNote />);

    act(() => {
      jest.advanceTimersByTime(SLOW_LOADING_MS);
    });

    expect(screen.getByText('Still loading…')).toBeInTheDocument();
  });
});
