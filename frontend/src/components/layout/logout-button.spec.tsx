import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './logout-button';

jest.mock('@/lib/auth/session-client', () => ({ logout: jest.fn() }));

import { logout } from '@/lib/auth/session-client';

const logoutMock = logout as jest.MockedFunction<typeof logout>;

describe('LogoutButton', () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  it('should end the session when clicked', async () => {
    logoutMock.mockResolvedValue(undefined);
    render(<LogoutButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('should disable itself and say it is signing out while the request is pending', async () => {
    logoutMock.mockReturnValue(new Promise(() => undefined));
    render(<LogoutButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(screen.getByRole('button', { name: 'Выходим…' })).toBeDisabled();
  });
});
