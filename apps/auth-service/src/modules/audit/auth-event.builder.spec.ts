import type { FhirClient } from '@medcenter/fhir';

import { AuditService } from './audit.service';
import { buildAuthAuditEvent } from './auth-event.builder';

const DCM = 'http://dicom.nema.org/resources/ontology/DCM';

describe('buildAuthAuditEvent', () => {
  it('should record a successful login as DCM 110114 / 110122 with outcome 0 and the user as agent', () => {
    const event = buildAuthAuditEvent({ kind: 'login', userId: 'user-1', requestId: 'req-1' });

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      type: { system: DCM, code: '110114', display: 'User Authentication' },
      subtype: [{ system: DCM, code: '110122', display: 'Login' }],
      action: 'E',
      outcome: '0',
      agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
      source: { observer: { display: 'auth-service' } },
    });
    expect(event['outcomeDesc']).toBeUndefined();
    expect(event['entity']).toEqual([
      expect.objectContaining({ what: { identifier: { system: 'https://api.medcenter.by/sid/auth-user', value: 'user-1' } } }),
      expect.objectContaining({ type: expect.objectContaining({ code: 'XrequestId' }) }),
    ]);
  });

  it('should record a logout as 110123 with outcome 0', () => {
    expect(buildAuthAuditEvent({ kind: 'logout', userId: 'user-1' })).toMatchObject({
      subtype: [{ code: '110123', display: 'Logout' }],
      outcome: '0',
    });
  });

  it('should record a failed login as Login with outcome 4 and no agent identity when the account is unknown', () => {
    const event = buildAuthAuditEvent({ kind: 'login-failed' });

    expect(event).toMatchObject({ subtype: [{ code: '110122' }], outcome: '4', outcomeDesc: 'login-failed' });
    expect(event['agent']).toEqual([{ requestor: true }]);
    expect(event['entity']).toEqual([]);
  });

  it('should record a throttled login as Login with outcome 4 and its reason', () => {
    expect(buildAuthAuditEvent({ kind: 'login-throttled' })).toMatchObject({ outcome: '4', outcomeDesc: 'login-throttled' });
  });

  it('should record an idle session end as Logout with outcome 0 and its reason', () => {
    expect(buildAuthAuditEvent({ kind: 'session-idle', userId: 'user-1' })).toMatchObject({
      subtype: [{ code: '110123' }],
      outcome: '0',
      outcomeDesc: 'session-idle',
    });
  });

  it('should carry no token, password, address or user agent', () => {
    const text = JSON.stringify(buildAuthAuditEvent({ kind: 'login-failed', userId: 'user-1', requestId: 'r' }));

    expect(text).not.toMatch(/password|token|"network"|userAgent/i);
  });
});

describe('AuditService.recordAuthEvent', () => {
  it('should swallow a HAPI failure so the sign-in is never affected', async () => {
    const fhir = { create: jest.fn().mockRejectedValue(new Error('hapi down')) } as unknown as FhirClient;

    await expect(new AuditService(fhir).recordAuthEvent({ kind: 'login', userId: 'u1' })).resolves.toBeUndefined();
  });
});
