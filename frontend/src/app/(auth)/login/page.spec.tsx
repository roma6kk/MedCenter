import { render, screen } from '@testing-library/react';
import LoginPage from './page';

async function renderPage(search: Record<string, string>): Promise<void> {
  render(await LoginPage({ searchParams: Promise.resolve(search) }));
}

describe('LoginPage', () => {
  it('should start the flow towards the page the visitor wanted when returnTo names a page of the site', async () => {
    await renderPage({ returnTo: '/booking' });

    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize?returnTo=%2Fbooking');
    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
  });

  it('should show a readable message when the callback sends access_denied back', async () => {
    await renderPage({ error: 'access_denied' });

    expect(screen.getByTestId('login-error')).toHaveTextContent('Не удалось выполнить вход');
  });

  it('should show another message when the sign-in service itself failed', async () => {
    await renderPage({ error: 'temporarily_unavailable' });

    expect(screen.getByTestId('login-error')).toHaveTextContent('временно недоступен');
  });

  it('should not echo the raw error code into the page when the callback reports an unknown error', async () => {
    await renderPage({ error: '<img src=x onerror=alert(1)>' });

    expect(document.body.innerHTML).not.toContain('onerror');
  });

  it('should ignore the returnTo when it leaves the site', async () => {
    await renderPage({ returnTo: 'https://evil.example/steal' });

    expect(screen.getByRole('link', { name: 'Войти' })).not.toHaveAttribute('href', expect.stringContaining('evil'));
  });
});
