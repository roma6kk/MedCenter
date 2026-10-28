import { render, screen } from '@testing-library/react';

const REDIRECT = new Error('NEXT_REDIRECT');
const redirectMock = jest.fn((_to: string): never => {
  throw REDIRECT;
});
jest.mock('next/navigation', () => ({ redirect: (to: string) => redirectMock(to) }));

import LoginPage from './page';

async function open(search: Record<string, string>): Promise<void> {
  render(await LoginPage({ searchParams: Promise.resolve(search) }));
}

describe('LoginPage', () => {
  beforeEach(() => redirectMock.mockClear());

  it('should go straight to the authorization redirect towards the page the visitor wanted when returnTo names a page of the site', async () => {
    await expect(open({ returnTo: '/booking' })).rejects.toBe(REDIRECT);

    expect(redirectMock).toHaveBeenCalledWith('/api/auth/authorize?returnTo=%2Fbooking');
  });

  it('should go straight to the authorization redirect and leave the destination to the role when the visitor opens the login directly', async () => {
    await expect(open({})).rejects.toBe(REDIRECT);

    expect(redirectMock).toHaveBeenCalledWith('/api/auth/authorize');
  });

  it('should drop the returnTo when it leaves the site', async () => {
    await expect(open({ returnTo: 'https://evil.example/steal' })).rejects.toBe(REDIRECT);

    expect(redirectMock).toHaveBeenCalledWith('/api/auth/authorize');
  });

  it('should show a readable message and a retry link, not redirect again, when the callback sends access_denied back', async () => {
    await open({ error: 'access_denied', returnTo: '/booking' });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-error')).toHaveTextContent('Не удалось выполнить вход');
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize?returnTo=%2Fbooking');
  });

  it('should stay on the page, so the toast can say why, when a revoked session sent the visitor here', async () => {
    await open({ returnTo: '/appointments', reason: 'session-ended' });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize?returnTo=%2Fappointments');
    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
  });

  it('should show another message when the sign-in service itself failed', async () => {
    await open({ error: 'temporarily_unavailable' });

    expect(screen.getByTestId('login-error')).toHaveTextContent('временно недоступен');
  });

  it('should not echo the raw error code into the page when the callback reports an unknown error', async () => {
    await open({ error: '<img src=x onerror=alert(1)>' });

    expect(document.body.innerHTML).not.toContain('onerror');
  });
});
