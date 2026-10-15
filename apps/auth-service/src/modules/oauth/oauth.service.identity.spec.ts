import { Role } from '@medcenter/contracts';

import type { TokenResponse } from './oauth.service';
import {
  captureOAuthError,
  createOAuthHarness as createHarness,
  decodeClaims,
  readRedirectParam as cookieFromRedirect,
  type OAuthHarness as Harness,
} from './__tests__/oauth-harness';
import { TEST_REDIRECT_URI, createTestClient } from './__tests__/test-keys';

describe('OAuthService identity claims', () => {
  const ALL_SCOPES = 'launch patient/*.read patient/*.write user/*.read user/*.write';

  async function loginAs(harness: Harness, userId: string, role: Role): Promise<TokenResponse> {
    const { codeVerifier, codeChallenge } = harness.pkce.generate();
    const redirect = await harness.service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: ALL_SCOPES,
      state: 's',
      codeChallenge,
      principal: { userId, role },
    });
    return harness.service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });
  }

  it('should give a DOCTOR a PractitionerRole fhirUser and user scopes when the code is exchanged', async () => {
    const harness = createHarness();
    harness.identities.set('doc-1', { role: Role.DOCTOR, practitionerRoleId: 'role-7' });

    const response = await loginAs(harness, 'doc-1', Role.DOCTOR);

    const claims = decodeClaims(response.access_token);
    expect(response.scope).toBe('launch user/*.read user/*.write');
    expect(claims['fhirUser']).toBe('PractitionerRole/role-7');
    expect(claims['patient']).toBeUndefined();
    expect(response.patient).toBeUndefined();
  });

  it('should narrow a PATIENT to patient scopes when the client asks for every scope', async () => {
    const harness = createHarness();
    harness.identities.set('pat-1', { role: Role.PATIENT, patientId: 'p-1' });

    const response = await loginAs(harness, 'pat-1', Role.PATIENT);

    expect(response.scope).toBe('launch patient/*.read patient/*.write');
  });

  it('should answer invalid_scope when nothing requested is allowed for the role', async () => {
    const { service, pkce } = createHarness();
    const { codeChallenge } = pkce.generate();

    const error = await captureOAuthError(
      service.authorize({
        client: createTestClient(),
        redirectUri: TEST_REDIRECT_URI,
        scope: 'user/*.write',
        state: 's',
        codeChallenge,
        principal: { userId: 'pat-2', role: Role.PATIENT },
      }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_scope' });
  });

  it('should re-resolve the identity when the refresh token is rotated', async () => {
    const harness = createHarness();
    harness.identities.set('doc-2', { role: Role.DOCTOR });
    const first = await loginAs(harness, 'doc-2', Role.DOCTOR);
    harness.identities.set('doc-2', { role: Role.DOCTOR, practitionerRoleId: 'role-9' });

    const rotated = await harness.service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' });

    expect(decodeClaims(first.access_token)['fhirUser']).toBeUndefined();
    expect(decodeClaims(rotated.access_token)['fhirUser']).toBe('PractitionerRole/role-9');
  });

  it('should refuse to refresh with invalid_grant when the account was deactivated', async () => {
    const harness = createHarness();
    harness.identities.set('pat-3', { role: Role.PATIENT, patientId: 'p-3' });
    const first = await loginAs(harness, 'pat-3', Role.PATIENT);
    harness.identities.set('pat-3', null);

    const error = await captureOAuthError(
      harness.service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should drop the scopes the new role cannot hold when the refresh token is rotated', async () => {
    const harness = createHarness();
    harness.identities.set('u-9', { role: Role.PATIENT, patientId: 'p-9' });
    const first = await loginAs(harness, 'u-9', Role.PATIENT);
    harness.identities.set('u-9', { role: Role.ADMIN });

    const rotated = await harness.service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' });

    expect(rotated.scope).toBe('launch');
    expect(decodeClaims(rotated.access_token)['role']).toBe('ADMIN');
    expect(rotated.patient).toBeUndefined();
  });
});
