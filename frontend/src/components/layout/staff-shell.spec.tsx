import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { logout } from '@/lib/auth/session-client';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { ADMIN_LINKS, DOCTOR_LINKS, STAFF_ASIDE_SLOT_ID, StaffShell } from './staff-shell';

const mockPathname = jest.fn<string | null, []>();
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));
jest.mock('@/lib/auth/session-client', () => ({ logout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/components/patient/patient-api', () => ({
  fetchAccount: jest.fn().mockResolvedValue({ id: 'u1', email: 'x@y.z', firstName: 'Мария', lastName: 'Иванова', name: 'Иванова Мария', isActive: true }),
}));
jest.mock('@/components/catalog/catalog-api', () => ({
  fetchDoctors: jest.fn().mockResolvedValue({
    items: [
      { id: 'd1', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт', practitionerRoleIds: ['role-7'] },
      { id: 'd2', firstName: 'Сергей', lastName: 'Петров', name: 'Сергей Петров', specialty: 'Хирург', practitionerRoleIds: ['role-8'] },
    ],
    meta: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
  }),
}));
jest.mock('@/components/doctor/doctor-api', () => ({
  ...jest.requireActual('@/components/doctor/doctor-api'),
  fetchDoctorJournal: jest.fn().mockResolvedValue({
    items: [{ id: 'a1', status: 'fulfilled', start: '2026-10-20T06:00:00Z', end: '2026-10-20T06:30:00Z', slotId: 's', patientId: 'p-9', patientName: 'Кузнецов Павел', doctorId: 'd', practitionerRoleId: 'r', serviceId: 'x', createdAt: '2026-10-01T00:00:00Z' }],
    meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
  }),
}));

function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

function signIn(role: 'DOCTOR' | 'ADMIN', fhirUser: string | null = null): void {
  useSessionStore.setState({ accessToken: null, expiresAt: null, scope: null, patientRef: null, fhirUser, hydrated: true, role });
}

function viewport(isWide: boolean): void {
  window.matchMedia = jest.fn().mockImplementation(() => ({ matches: isWide, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
}

describe('StaffShell sidebar', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    mockPathname.mockReturnValue('/doctor/appointments');
    useUiStore.setState({ locale: 'ru', themeMode: 'system' });
    jest.clearAllMocks();
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('should show the full name and the specialty of the signed-in doctor with an avatar on the profile button (A14)', async () => {
    signIn('DOCTOR', 'PractitionerRole/role-7');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    const button = await screen.findByRole('button', { name: 'Меню профиля: Иванова Мария' });
    await waitFor(() => expect(button).toHaveTextContent('Терапевт'));
    expect(button).toHaveTextContent('Иванова Мария');
    expect(button).toHaveTextContent('ИМ');
  });

  it('should say «Администратор» under the name of an administrator', async () => {
    signIn('ADMIN');

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: 'Меню профиля: Иванова Мария' })).toHaveTextContent('Администратор');
  });

  it('should fall back to the role word until the account is read', () => {
    signIn('DOCTOR');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Меню профиля: Врач' })).toBeInTheDocument();
  });

  it('should gather the language, the theme and «Выйти» into one menu with the current choices ticked', async () => {
    signIn('DOCTOR');
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));

    expect(screen.getByRole('menuitemradio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Как в системе' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('should switch the language and the theme from the menu', async () => {
    signIn('DOCTOR');
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Тёмная' }));
    expect(useUiStore.getState().themeMode).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(useUiStore.getState().locale).toBe('en');
  });

  it('should end the session when «Выйти» is chosen in the menu', async () => {
    signIn('ADMIN');
    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: /^Меню профиля/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Выйти' }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('should make the sidebar a translucent material that fills the height of the page with a panel that sticks to the screen (VD3)', () => {
    signIn('DOCTOR');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    const panel = screen.getByRole('complementary');
    expect(panel).toHaveClass('sticky', 'top-0', 'h-screen');
    expect(panel.parentElement).toHaveClass('bg-glass', 'backdrop-blur-md');
  });

  it('should mark the current section with a filled bar as well as the fill', () => {
    signIn('DOCTOR');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Журнал' })).toHaveClass('aria-[current=page]:before:bg-primary', 'aria-[current=page]:bg-primary-soft');
  });

  it('should keep the slot for a page legend under the navigation', () => {
    signIn('DOCTOR');

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(document.getElementById(STAFF_ASIDE_SLOT_ID)).not.toBeNull();
  });
});

describe('StaffShell patient search', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/doctor/appointments');
    useUiStore.setState({ locale: 'ru', themeMode: 'system' });
    jest.clearAllMocks();
  });

  it('should offer a patient search to a doctor and not to an administrator (A13)', () => {
    signIn('DOCTOR');
    const { unmount } = render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    expect(screen.getByRole('search', { name: 'Поиск пациента' })).toBeInTheDocument();
    unmount();

    signIn('ADMIN');
    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('should find a patient of the journal by a part of the name and link to the card', async () => {
    signIn('DOCTOR');
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск пациента' }), 'кузн');

    const link = await screen.findByRole('link', { name: /Кузнецов Павел/ });
    expect(link).toHaveAttribute('href', '/patients/p-9');
  });

  it('should say so when nobody matches and clear the field with Escape', async () => {
    signIn('DOCTOR');
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    const field = screen.getByRole('searchbox', { name: 'Поиск пациента' });

    await userEvent.type(field, 'сидоров');
    expect(await screen.findByText(/такого нет/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(field).toHaveValue('');
  });

  it('should not read the journal before something is typed', () => {
    signIn('DOCTOR');
    const { fetchDoctorJournal } = jest.requireMock('@/components/doctor/doctor-api') as { fetchDoctorJournal: jest.Mock };

    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(fetchDoctorJournal).not.toHaveBeenCalled();
  });
});

describe('StaffShell on a phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    viewport(false);
    mockPathname.mockReturnValue('/admin/users');
    useUiStore.setState({ locale: 'ru', themeMode: 'system' });
    jest.clearAllMocks();
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('should show a top bar with a burger instead of the sidebar and a block of links (D7)', () => {
    signIn('ADMIN');

    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('should open the navigation in a drawer with the current section marked and close it when a link is followed', async () => {
    signIn('ADMIN');
    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Лайфлайн' }));

    expect(drawer.getAllByRole('link')).toHaveLength(ADMIN_LINKS.length);
    expect(drawer.getByRole('link', { name: 'Пользователи' })).toHaveAttribute('aria-current', 'page');
    // jsdom cannot navigate: the link is followed in spirit only, after the shell's own handler has seen the click.
    const stopNavigation = (event: Event): void => event.preventDefault();
    document.addEventListener('click', stopNavigation);
    await userEvent.click(drawer.getByRole('link', { name: 'Аудит' }));
    document.removeEventListener('click', stopNavigation);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should slide the drawer in from the left because the burger sits on the left', async () => {
    signIn('ADMIN');
    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));

    expect(screen.getByRole('dialog', { name: 'Лайфлайн' })).toHaveClass('animate-drawer-left-in');
  });

  it('should return the focus to the burger when the drawer is closed with Escape', async () => {
    signIn('ADMIN');
    render(<StaffShell links={ADMIN_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    const burger = screen.getByRole('button', { name: 'Открыть меню' });
    await userEvent.click(burger);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(burger).toHaveFocus();
  });

  it('should keep the profile menu on the bar and the patient search in the drawer of a doctor', async () => {
    signIn('DOCTOR');
    mockPathname.mockReturnValue('/doctor/schedule');
    render(<StaffShell links={DOCTOR_LINKS}><p>x</p></StaffShell>, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /^Меню профиля/ })).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));

    expect(within(screen.getByRole('dialog')).getByRole('search', { name: 'Поиск пациента' })).toBeInTheDocument();
  });
});
