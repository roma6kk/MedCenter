import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadSession } from '@/lib/auth/session-client';
import { useSessionStore } from '@/store/use-session-store';
import { RoleGuard } from './role-guard';

const replace = jest.fn();

jest.mock('@/lib/auth/session-client', () => ({ ...jest.requireActual('@/lib/auth/session-client'), loadSession: jest.fn() }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const EMPTY_SESSION = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: false, unavailable: false };

describe('RoleGuard', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/admin/users');
    replace.mockClear();
    (loadSession as jest.Mock).mockReset().mockResolvedValue(undefined);
    useSessionStore.setState(EMPTY_SESSION);
  });

  it('should render children for the matching role', () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, role: 'ADMIN' });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.getByText('панель админа')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('should redirect a wrong role to /403 without rendering children', () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, role: 'PATIENT' });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.queryByText('панель админа')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/403');
  });

  it('should redirect an anonymous session to login with returnTo', () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, role: null });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(replace).toHaveBeenCalledWith('/login?returnTo=%2Fadmin%2Fusers');
  });

  it('should keep the query of the page in returnTo, so a chosen period survives signing in again', () => {
    window.history.pushState({}, '', '/admin/analytics?from=2026-10-01&to=2026-10-31');
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, role: null });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(replace).toHaveBeenCalledWith('/login?returnTo=%2Fadmin%2Fanalytics%3Ffrom%3D2026-10-01%26to%3D2026-10-31');
  });

  it('should render nothing and redirect nothing while the session is loading', () => {
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.queryByText('панель админа')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('should offer a retry, not the sign-in page, when auth-service did not answer and nothing is known about the visitor', () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, unavailable: true });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.queryByText('панель админа')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис входа временно недоступен');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should load the session again on retry and let the page through once it is back', async () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, unavailable: true });
    (loadSession as jest.Mock).mockImplementation(() => {
      useSessionStore.getState().setSession({ accessToken: 'a.b.c', expiresAt: null, role: 'ADMIN', scope: null, patientRef: null, fhirUser: null });
      return Promise.resolve();
    });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText('панель админа')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('should keep showing the retry when the session is still unavailable after the attempt', async () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, unavailable: true });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('should still let a known role through while the last exchange got no answer', () => {
    useSessionStore.setState({ ...EMPTY_SESSION, hydrated: true, role: 'ADMIN', unavailable: true });
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.getByText('панель админа')).toBeInTheDocument();
  });
});
