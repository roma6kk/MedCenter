import { render, screen, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({ usePathname: () => '/doctors' }));

import { useSessionStore } from '@/store/use-session-store';
import { PublicShell } from './public-shell';

function renderShell(): RenderResult {
  return render(<PublicShell><p>content</p></PublicShell>);
}

function signInAs(role: 'PATIENT' | 'DOCTOR' | 'ADMIN'): void {
  useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role, scope: null, patientRef: null, fhirUser: null });
}

describe('PublicShell', () => {
  beforeEach(() => useSessionStore.getState().clearSession());

  it('should offer sign-in and registration when nobody is signed in', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize');
    expect(screen.getByRole('link', { name: 'Регистрация' })).toHaveAttribute('href', '/register');
  });

  it('should keep the booking button and the phone in the header row for a guest and a patient, and drop the button for staff', () => {
    const { unmount } = renderShell();

    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'Записаться' })).toHaveAttribute('href', '/booking');
    expect(header.getByRole('link', { name: '+375 17 000-00-00' })).toBeInTheDocument();
    unmount();
    signInAs('ADMIN');
    renderShell();

    expect(screen.queryByRole('link', { name: 'Записаться' })).not.toBeInTheDocument();
  });

  it('should open a drawer with the sections, the sign-in, the phone and the switches when the burger is pressed, and close it again', async () => {
    renderShell();
    const burger = screen.getByRole('button', { name: 'Открыть меню' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(burger);

    const drawer = screen.getByRole('dialog', { name: 'Меню' });
    expect(within(drawer).getByRole('link', { name: 'Направления' })).toHaveAttribute('href', '/#directions');
    expect(within(drawer).getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/api/auth/authorize');
    expect(within(drawer).getByRole('link', { name: 'Регистрация' })).toHaveAttribute('href', '/register');
    expect(within(drawer).getByRole('link', { name: '+375 17 000-00-00' })).toHaveAttribute('href', 'tel:+375170000000');
    expect(within(drawer).getByRole('group', { name: 'Язык' })).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole('link', { name: 'Врачи' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should close the drawer on Escape and give the focus back to the burger', async () => {
    renderShell();
    const burger = screen.getByRole('button', { name: 'Открыть меню' });

    await userEvent.click(burger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(burger).toHaveFocus();
  });

  it('should offer the language and the theme switch in the header when the shell is rendered', () => {
    renderShell();

    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Тема оформления: / })).toBeInTheDocument();
  });

  it('should lead the patient to the cabinet instead when a patient is signed in', () => {
    signInAs('PATIENT');
    renderShell();

    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('should lead the doctor to the journal when a doctor is signed in', () => {
    signInAs('DOCTOR');
    renderShell();

    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/doctor/appointments');
  });

  it('should mark the doctors link as current and expose a skip link and a main landmark when the shell is rendered on the doctors page', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'Врачи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });
  it('should link to the landing sections from any public page when the header is rendered', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'Направления' })).toHaveAttribute('href', '/#directions');
    expect(screen.getByRole('link', { name: 'Компаниям' })).toHaveAttribute('href', '/#companies');
    expect(screen.getByRole('link', { name: 'Контакты' })).toHaveAttribute('href', '/#contacts');
  });

  it('should show the clinic phone as a call link when the header is rendered', () => {
    renderShell();

    expect(screen.getByRole('link', { name: '+375 17 000-00-00' })).toHaveAttribute('href', 'tel:+375170000000');
  });

  it('should end every public page with the legal line and the demonstration note when the shell is rendered', () => {
    renderShell();

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('ООО «Лайфлайн»');
    expect(footer).toHaveTextContent('Лицензия №');
    expect(footer).toHaveTextContent('Демонстрационные данные');
  });
});
