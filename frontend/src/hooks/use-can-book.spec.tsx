import { renderHook } from '@testing-library/react';
import { useSessionStore, type UserRole } from '@/store/use-session-store';
import { useCanBook } from './use-can-book';

function signIn(role: UserRole | null): void {
  useSessionStore.setState({ accessToken: null, expiresAt: null, role, scope: null, patientRef: null, fhirUser: null, hydrated: true, unavailable: false });
}

describe('useCanBook', () => {
  it.each([[null], ['PATIENT']] as const)('should offer the booking to %s', (role) => {
    signIn(role);

    expect(renderHook(() => useCanBook()).result.current).toBe(true);
  });

  it.each([['DOCTOR'], ['ADMIN']] as const)('should not offer the booking to %s', (role) => {
    signIn(role);

    expect(renderHook(() => useCanBook()).result.current).toBe(false);
  });
});
