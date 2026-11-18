import { useSessionStore } from './use-session-store';

const EMPTY = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: false, unavailable: false };
const DOCTOR = { accessToken: 'a.b.c', expiresAt: null, role: 'DOCTOR' as const, scope: null, patientRef: null, fhirUser: null };

describe('useSessionStore unavailable flag', () => {
  beforeEach(() => {
    useSessionStore.setState(EMPTY);
  });

  it('should mark an unknown visitor hydrated and unavailable', () => {
    useSessionStore.getState().markUnavailable();

    expect(useSessionStore.getState()).toMatchObject({ hydrated: true, unavailable: true, role: null });
  });

  it('should leave a session that is already in memory alone', () => {
    useSessionStore.getState().setSession(DOCTOR);

    useSessionStore.getState().markUnavailable();

    expect(useSessionStore.getState()).toMatchObject({ hydrated: true, unavailable: false, role: 'DOCTOR' });
  });

  it('should drop the flag when a session arrives or the visitor is signed out', () => {
    useSessionStore.getState().markUnavailable();
    useSessionStore.getState().setSession(DOCTOR);
    expect(useSessionStore.getState().unavailable).toBe(false);

    useSessionStore.setState({ unavailable: true });
    useSessionStore.getState().clearSession();
    expect(useSessionStore.getState().unavailable).toBe(false);
  });
});
