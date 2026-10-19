import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ usePathname: () => '/doctors' }));

import { useSessionStore } from '@/store/use-session-store';
import { PublicShell } from './public-shell';

describe('PublicShell', () => {
  beforeEach(() => useSessionStore.getState().clearSession());

  it('should offer sign-in and registration when nobody is signed in', () => {
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Регистрация' })).toHaveAttribute('href', '/register');
  });

  it('should lead the patient to the cabinet instead when a patient is signed in', () => {
    useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role: 'PATIENT', scope: null, patientRef: null, fhirUser: null });
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/booking');
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('should lead the doctor to the journal when a doctor is signed in', () => {
    useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role: 'DOCTOR', scope: null, patientRef: null, fhirUser: null });
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/doctor/appointments');
  });

  it('should mark the doctors link as current and expose a skip link and a main landmark when the shell is rendered on the doctors page', () => {
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: 'Врачи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });
});
