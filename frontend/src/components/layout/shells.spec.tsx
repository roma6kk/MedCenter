import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { PatientShell } from './patient-shell';
import { ADMIN_LINKS, DOCTOR_LINKS, StaffShell } from './staff-shell';

jest.mock('@/lib/notifications/notification-api', () => ({ fetchUnreadCount: jest.fn().mockResolvedValue(0) }));
jest.mock('@/components/patient/patient-api', () => ({ fetchAccount: jest.fn().mockResolvedValue({ id: 'u1', email: 'x@y.z', firstName: 'Мария', lastName: 'Иванова', name: 'Иванова Мария', isActive: true }) }));
jest.mock('@/components/catalog/catalog-api', () => ({ fetchDoctors: jest.fn().mockResolvedValue({ items: [], meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 1 } }) }));

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

  it('should list three sections: the home, the appointments and the medical record', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    const nav = screen.getByRole('navigation', { name: 'Пациент' });
    expect(within(nav).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Главная', '/home'],
      ['Мои записи', '/appointments'],
      ['Медкарта', '/medcard'],
    ]);
  });

  it('should offer «Записаться» as the primary button next to the bell, outside the navigation', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    const book = screen.getByRole('link', { name: 'Записаться' });
    expect(book).toHaveAttribute('href', '/booking');
    expect(book.className).toContain('bg-primary');
    expect(within(screen.getByRole('navigation', { name: 'Пациент' })).queryByRole('link', { name: 'Записаться' })).not.toBeInTheDocument();
  });

  it('should not link to the notifications page from the header itself: the bell opens a dropdown', async () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    await screen.findByRole('button', { name: /Уведомления, непрочитанных/ });

    expect(screen.queryAllByRole('link').filter((link) => link.getAttribute('href') === '/notifications')).toHaveLength(0);
  });

  it('should mark the notifications bell as the current page when the patient is on /notifications', async () => {
    mockPathname.mockReturnValue('/notifications');

    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: /Уведомления, непрочитанных/ })).toHaveAttribute('aria-current', 'page');
  });

  it('should keep every navigation link at least 44 px tall when the shell is shown', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    within(screen.getByRole('navigation', { name: 'Пациент' })).getAllByRole('link').forEach((link) => expect(link.className).toContain('min-h-[44px]'));
  });

  it('should mark the current section with aria-current', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Мои записи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');
  });

  it('should carry the notification bell, the language switch and the logout button', async () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: /Уведомления, непрочитанных/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('should carry the theme switch next to the language switch', () => {
    render(<PatientShell><p>x</p></PatientShell>, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: /^Тема оформления: / })).toBeInTheDocument();
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

    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');
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

  it('should keep the theme switch in the profile menu instead of loose in the sidebar', async () => {
    useSessionStore.setState({ ...SESSION, role: 'DOCTOR' });
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    expect(screen.queryByRole('group', { name: 'Тема оформления' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));

    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(expect.arrayContaining(['Как в системе', 'Светлая', 'Тёмная']));
  });

  it('should have no notification bell because doctors and administrators have no notification endpoints', () => {
    useSessionStore.setState({ ...SESSION, role: 'DOCTOR' });

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.queryByRole('link', { name: /Уведомления/ })).not.toBeInTheDocument();
  });

  it('should keep every navigation link at least 44 px tall when the shell is shown', () => {
    useSessionStore.setState({ ...SESSION, role: 'ADMIN' });

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    const nav = screen.getByRole('navigation', { name: 'Администрирование' });
    nav.querySelectorAll('a').forEach((link) => expect(link.className).toContain('min-h-[44px]'));
  });

  it('should render exactly one skip link when the shell is shown', () => {
    useSessionStore.setState({ ...SESSION, role: 'ADMIN' });

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getAllByRole('link', { name: 'Перейти к содержимому' })).toHaveLength(1);
  });

  it('should offer «Выйти» in the profile menu and a skip link', async () => {
    useSessionStore.setState({ ...SESSION, role: 'ADMIN' });

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));

    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#main-content');
  });
});
