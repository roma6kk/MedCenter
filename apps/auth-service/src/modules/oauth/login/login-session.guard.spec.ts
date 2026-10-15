import type { ExecutionContext } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { createLoginHarness } from '../__tests__/login-harness';
import { LOGIN_SESSION_COOKIE } from './login-cookies';
import { LoginSessionGuard, type RequestWithLoginSession } from './login-session.guard';

function contextFor(request: RequestWithLoginSession): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function requestWithCookie(cookie?: string): RequestWithLoginSession {
  return { headers: cookie === undefined ? {} : { cookie: `other=1; ${LOGIN_SESSION_COOKIE}=${cookie}` } };
}

describe('LoginSessionGuard', () => {
  it('should attach the doctor principal with its PractitionerRole fhirUser when the session is valid', async () => {
    // Arrange
    const { sessions, identities } = createLoginHarness();
    identities.set('doc-1', { role: Role.DOCTOR, practitionerRoleId: 'role-7' });
    const request = requestWithCookie(sessions.issue('doc-1'));

    // Act
    const allowed = await new LoginSessionGuard(sessions, identities).canActivate(contextFor(request));

    // Assert
    expect(allowed).toBe(true);
    expect(request.principal).toMatchObject({
      userId: 'doc-1',
      claims: { role: Role.DOCTOR, fhirUser: 'PractitionerRole/role-7' },
    });
  });

  it('should leave the principal unset when no session cookie is presented', async () => {
    const { sessions, identities } = createLoginHarness();
    const request = requestWithCookie();

    await expect(new LoginSessionGuard(sessions, identities).canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toBeUndefined();
  });

  it('should leave the principal unset when the account was deactivated after the login', async () => {
    const { sessions, identities } = createLoginHarness();
    identities.set('gone-1', null);
    const request = requestWithCookie(sessions.issue('gone-1'));

    await new LoginSessionGuard(sessions, identities).canActivate(contextFor(request));

    expect(request.principal).toBeUndefined();
  });

  it('should leave the principal unset when the cookie is forged', async () => {
    const { sessions, identities } = createLoginHarness();
    const request = requestWithCookie('eyJzdWIiOiJhZG1pbiJ9.forged');

    await new LoginSessionGuard(sessions, identities).canActivate(contextFor(request));

    expect(request.principal).toBeUndefined();
  });
});
