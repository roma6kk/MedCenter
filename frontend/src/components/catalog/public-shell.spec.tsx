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
  it('should link to the landing sections from any public page when the header is rendered', () => {
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: 'Направления' })).toHaveAttribute('href', '/#directions');
    expect(screen.getByRole('link', { name: 'Компаниям' })).toHaveAttribute('href', '/#companies');
    expect(screen.getByRole('link', { name: 'Контакты' })).toHaveAttribute('href', '/#contacts');
  });

  it('should show the clinic phone as a call link when the header is rendered', () => {
    render(<PublicShell><p>content</p></PublicShell>);

    expect(screen.getByRole('link', { name: '+375 17 000-00-00' })).toHaveAttribute('href', 'tel:+375170000000');
  });

  it('should end every public page with the legal line and the demonstration note when the shell is rendered', () => {
    render(<PublicShell><p>content</p></PublicShell>);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('ООО «Лайфлайн»');
    expect(footer).toHaveTextContent('Лицензия №');
    expect(footer).toHaveTextContent('Демонстрационные данные');
  });
});
