import { Role } from '@medcenter/contracts';

import { AuthorizeController, type AuthorizeRequest } from './authorize.controller';
import { LOGIN_CSRF_COOKIE, LOGIN_SESSION_COOKIE } from './login/login-cookies';
import { OAuthError } from './oauth-error';
import { createFakeResponse } from './__tests__/fake-response';
import { createLoginHarness, type LoginHarness } from './__tests__/login-harness';
import { TEST_REDIRECT_URI, createTestClient } from './__tests__/test-keys';

interface Setup extends LoginHarness {
  readonly controller: AuthorizeController;
}

function setup(): Setup {
  const harness = createLoginHarness();
  return { ...harness, controller: new AuthorizeController(harness.service, harness.sessions, harness.page) };
}

function authorizeRequest(extra: Partial<AuthorizeRequest> = {}, query: Record<string, string> = {}): AuthorizeRequest {
  return {
    headers: {},
    query: {
      response_type: 'code',
      client_id: 'medcenter-web',
      redirect_uri: TEST_REDIRECT_URI,
      state: 'st',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      ...query,
    },
    client: createTestClient(),
    ...extra,
  };
}

const PATIENT_PRINCIPAL = {
  sessionId: 'sid-1',
  userId: 'u1',
  claims: { role: Role.PATIENT, patient: 'pat-1', fhirUser: 'Patient/pat-1' },
};

describe('AuthorizeController', () => {
  it('should render the login form instead of redirecting when there is no login session', async () => {
    // Arrange
    const { controller } = setup();
    const fake = createFakeResponse();

    // Act
    await controller.authorize(authorizeRequest(), fake.response);

    // Assert
    expect(fake.redirect).not.toHaveBeenCalled();
    expect(fake.statusCode()).toBe(200);
    expect(fake.headers['Content-Type']).toContain('text/html');
    expect(fake.body()).toContain('action="/oauth/login"');
    expect(fake.body()).toContain('client_id=medcenter-web');
    expect(fake.cookies.map((cookie) => cookie.name)).toEqual([LOGIN_CSRF_COOKIE]);
  });

  it('should link the login form to the registration page of the client when it is rendered', async () => {
    const { controller } = setup();
    const fake = createFakeResponse();

    await controller.authorize(authorizeRequest(), fake.response);

    expect(fake.body()).toContain('href="https://app.medcenter.by/register"');
  });

  it('should redirect with a code and consume the session when a login session is present', async () => {
    const { controller, sessions } = setup();
    const fake = createFakeResponse();
    const cookie = sessions.issue('u1');
    const session = await sessions.read(cookie);
    const principal = { ...PATIENT_PRINCIPAL, sessionId: session?.sessionId ?? '' };

    await controller.authorize(authorizeRequest({ principal }, { scope: 'patient/*.read' }), fake.response);

    const target = new URL(fake.redirectTarget() ?? '');
    expect(target.searchParams.get('code')).toBeTruthy();
    expect(target.searchParams.get('state')).toBe('st');
    expect(fake.cleared).toContain(LOGIN_SESSION_COOKIE);
    await expect(sessions.read(cookie)).resolves.toBeNull();
  });

  it('should let an infrastructure failure reach the global filter instead of reporting access_denied', async () => {
    const { controller, service } = setup();
    const fake = createFakeResponse();
    jest.spyOn(service, 'authorize').mockRejectedValue(new Error('token store unreachable'));

    await expect(
      controller.authorize(authorizeRequest({ principal: PATIENT_PRINCIPAL }), fake.response),
    ).rejects.toThrow('token store unreachable');
    expect(fake.redirect).not.toHaveBeenCalled();
  });

  it('should bounce a token-endpoint-only failure to the client as access_denied', async () => {
    const { controller, service } = setup();
    const fake = createFakeResponse();
    jest.spyOn(service, 'authorize').mockRejectedValue(OAuthError.invalidGrant('not allowed here'));

    await controller.authorize(authorizeRequest({ principal: PATIENT_PRINCIPAL }), fake.response);

    const target = new URL(fake.redirectTarget() ?? '');
    expect(target.searchParams.get('error')).toBe('access_denied');
    expect(target.searchParams.get('state')).toBe('st');
  });

  it('should forward invalid_request to the client instead of access_denied', async () => {
    const { controller, service } = setup();
    const fake = createFakeResponse();
    jest.spyOn(service, 'authorize').mockRejectedValue(OAuthError.invalidRequest('redirect_uri was rejected'));

    await controller.authorize(authorizeRequest({ principal: PATIENT_PRINCIPAL }), fake.response);

    expect(new URL(fake.redirectTarget() ?? '').searchParams.get('error')).toBe('invalid_request');
  });

  it('should redirect with invalid_scope when no requested scope is allowed for the account', async () => {
    const { controller } = setup();
    const fake = createFakeResponse();

    await controller.authorize(
      authorizeRequest({ principal: PATIENT_PRINCIPAL }, { scope: 'user/*.write' }),
      fake.response,
    );

    const target = new URL(fake.redirectTarget() ?? '');
    expect(target.searchParams.get('error')).toBe('invalid_scope');
    expect(target.searchParams.get('code')).toBeNull();
  });

  it('should answer invalid_request when the client has no redirect target', async () => {
    const { controller } = setup();
    const fake = createFakeResponse();
    const request = authorizeRequest({ client: createTestClient({ redirectUris: [] }) }, { redirect_uri: '' });

    await expect(controller.authorize(request, fake.response)).rejects.toBeInstanceOf(OAuthError);
  });
});
