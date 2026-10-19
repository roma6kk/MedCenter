import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/auth/session-client', () => ({ ensureSession: jest.fn().mockResolvedValue(undefined) }));

import { LoginEntry } from '@/components/auth/login-entry';
import { setFlash } from '@/lib/ui/flash-message';
import { useUiStore } from '@/store/use-ui-store';
import { useToastStore } from '@/store/use-toast-store';
import AuthGroupLayout from './layout';

describe('AuthGroupLayout', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    useUiStore.setState({ locale: 'ru' });
    useToastStore.getState().clear();
  });

  it('should render the page inside the centred card when a sign-in screen is shown', () => {
    render(<AuthGroupLayout><p>sign-in form</p></AuthGroupLayout>);

    expect(screen.getByRole('main')).toHaveTextContent('sign-in form');
  });

  it('should tell the visitor the session ended when a revoked token sent them to the login', async () => {
    setFlash('session-ended');

    render(<AuthGroupLayout><p>sign-in form</p></AuthGroupLayout>);

    expect(await screen.findByText('Сессия завершена, войдите снова')).toBeInTheDocument();
  });

  it('should offer the language switch and translate the screen when the visitor picks English', async () => {
    render(<AuthGroupLayout><LoginEntry returnTo="/booking" /></AuthGroupLayout>);
    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'en' }));

    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
    expect(document.title).toMatch(/Sign in/);
  });

  it('should link back to the public site when a visitor opens a sign-in screen', () => {
    render(<AuthGroupLayout><p>sign-in form</p></AuthGroupLayout>);

    expect(screen.getByRole('link', { name: 'МедЦентр' })).toHaveAttribute('href', '/');
  });
});
