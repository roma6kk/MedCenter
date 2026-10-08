import { render, screen } from '@testing-library/react';
import { useSessionStore } from '@/store/use-session-store';
import { RoleGuard } from './role-guard';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/users',
}));

const EMPTY_SESSION = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: false };

describe('RoleGuard', () => {
  beforeEach(() => {
    replace.mockClear();
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

  it('should render nothing and redirect nothing while the session is loading', () => {
    render(<RoleGuard required="ADMIN"><p>панель админа</p></RoleGuard>);

    expect(screen.queryByText('панель админа')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
