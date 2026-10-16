import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { PatientShell } from './patient-shell';
import { ADMIN_LINKS, DOCTOR_LINKS, StaffShell } from './staff-shell';

jest.mock('@/lib/notifications/notification-api', () => ({ fetchUnreadCount: jest.fn().mockResolvedValue(0) }));

const mockPathname = jest.fn<string | null, []>();
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

const SESSION = { accessToken: null, expiresAt: null, scope: null, patientRef: null, fhirUser: null, hydrated: true };

function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('PatientShell', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/appointments/a1');
    useUiStore.setState({ locale: 'ru' });
    useSessionStore.setState({ ...SESSION, role: 'PATIENT' });
  });

  it('should offer a skip link that targets the main landmark', () => {
    render(<PatientShell><p>содержимое</p></PatientShell>, { wrapper: Wrapper });

    const skip = screen.getByRole('link', { name: 'Перейти к содержимому' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('should list the patient sections including the profile', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    const nav = screen.getByRole('navigation', { name: 'Пациент' });
    ['Запись', 'Мои записи', 'История', 'Назначения', 'Профиль', 'Уведомления'].forEach((label) => {
      expect(nav).toHaveTextContent(label);
    });
  });

  it('should mark the current section with aria-current', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Мои записи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Запись' })).not.toHaveAttribute('aria-current');
  });

  it('should carry the notification bell, the language switch and the logout button', async () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(await screen.findByRole('link', { name: /Уведомления, непрочитанных/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('should switch to English labels when the locale changes', () => {
    useUiStore.setState({ locale: 'en' });

    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'My appointments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('should tolerate a missing pathname', () => {
    mockPathname.mockReturnValue(null);

    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Запись' })).not.toHaveAttribute('aria-current');
  });
});

describe('StaffShell', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/admin/users');
    useUiStore.setState({ locale: 'ru' });
  });

  it('should name the navigation after the administrator role and highlight the current page', () => {
    useSessionStore.setState({ ...SESSION, role: 'ADMIN' });

    render(<StaffShell links={ADMIN_LINKS} title="Пользователи"><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getByRole('navigation', { name: 'Администрирование' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользователи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link')).toHaveLength(ADMIN_LINKS.length + 1);
  });

  it('should name the navigation after the doctor role and list the doctor sections', () => {
    useSessionStore.setState({ ...SESSION, role: 'DOCTOR' });
    mockPathname.mockReturnValue('/doctor/schedule');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getByRole('navigation', { name: 'Врач' })).toHaveTextContent('Журнал');
    expect(screen.getByRole('link', { name: 'Расписание' })).toHaveAttribute('aria-current', 'page');
  });

  it('should have no notification bell because doctors and administrators have no notification endpoints', () => {
    useSessionStore.setState({ ...SESSION, role: 'DOCTOR' });

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.queryByRole('link', { name: /Уведомления/ })).not.toBeInTheDocument();
  });

  it('should offer the logout button and a skip link', () => {
    useSessionStore.setState({ ...SESSION, role: 'ADMIN' });

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#main-content');
  });
});
