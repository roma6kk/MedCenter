import { act, fireEvent, render, screen } from '@testing-library/react';
import { IdleSessionWatcher } from './idle-session-watcher';
import { useSessionStore } from '@/store/use-session-store';

jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn().mockResolvedValue({ recorded: true }) }));
jest.mock('@/lib/auth/session-client', () => ({ endIdleSession: jest.fn(), refreshSession: jest.fn().mockResolvedValue('ok') }));

const { endIdleSession } = jest.requireMock('@/lib/auth/session-client') as { endIdleSession: jest.Mock };
const MINUTE = 60_000;

describe('IdleSessionWatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
    window.localStorage.clear();
    endIdleSession.mockClear();
    act(() => useSessionStore.setState({ role: 'PATIENT' } as never));
  });

  afterEach(() => {
    act(() => useSessionStore.setState({ role: null } as never));
    jest.useRealTimers();
  });

  it('should show a countdown a minute before the idle sign-out', () => {
    render(<IdleSessionWatcher />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(14 * MINUTE + 5_000));

    expect(screen.getByRole('dialog', { name: 'Сеанс скоро завершится' })).toBeInTheDocument();
    expect(screen.getByText(/Через 55 с сеанс завершится/)).toBeInTheDocument();
  });

  it('should keep the session and hide the warning when the user presses Continue', () => {
    render(<IdleSessionWatcher />);
    act(() => jest.advanceTimersByTime(14 * MINUTE + 5_000));

    const button = screen.getByRole('button', { name: 'Продолжить работу' });
    act(() => {
      fireEvent.pointerDown(button);
      fireEvent.click(button);
    });
    act(() => jest.advanceTimersByTime(2 * MINUTE));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(endIdleSession).not.toHaveBeenCalled();
  });

  it('should sign out and close the warning when the minute runs out', () => {
    render(<IdleSessionWatcher />);
    act(() => jest.advanceTimersByTime(15 * MINUTE + 5_000));

    expect(endIdleSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
