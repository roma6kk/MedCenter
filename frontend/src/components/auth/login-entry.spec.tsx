import { render, screen } from '@testing-library/react';
import { LoginEntry } from './login-entry';

describe('LoginEntry', () => {
  it('should start the sign-in flow towards the requested page when a returnTo is given', () => {
    render(<LoginEntry returnTo="/appointments?page=2" />);

    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize?returnTo=%2Fappointments%3Fpage%3D2');
  });

  it('should link to the registration page when the visitor has no account', () => {
    render(<LoginEntry returnTo="/booking" />);

    expect(screen.getByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute('href', '/register');
  });

  it('should show no error when the visit is plain', () => {
    render(<LoginEntry returnTo="/booking" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should tell the visitor that sign-in failed when the page opens after an access_denied redirect', () => {
    render(<LoginEntry returnTo="/booking" error="denied" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось выполнить вход');
  });

  it('should tell the visitor to try again later when the sign-in service is unavailable', () => {
    render(<LoginEntry returnTo="/booking" error="unavailable" />);

    expect(screen.getByRole('alert')).toHaveTextContent('временно недоступен');
  });
});
