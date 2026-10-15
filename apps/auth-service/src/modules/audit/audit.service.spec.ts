import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { AUTH_USER_IDENTIFIER_SYSTEM, buildUserAuditEvent } from './audit-event.builder';
import { AuditService } from './audit.service';

function fakeFhir(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn().mockResolvedValue({ resourceType: 'AuditEvent', id: 'ae-1' }),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

describe('buildUserAuditEvent', () => {
  it('should record the requesting agent, the FHIR resource first and the account when a patient registers', () => {
    const event = buildUserAuditEvent({
      action: 'create',
      actor: { sub: 'user-1', requestId: 'req-1' },
      userId: 'user-1',
      event: 'user.registered',
      resourceRefs: ['Patient/pat-1'],
    });

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'C',
      subtype: [{ code: 'create' }],
      agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
      source: { observer: { display: 'auth-service' } },
    });
    const entities = event['entity'] as ReadonlyArray<Record<string, unknown>>;
    expect(entities[0]).toEqual({
      what: { reference: 'Patient/pat-1' },
      role: { system: 'http://terminology.hl7.org/CodeSystem/object-role', code: '1', display: 'Patient' },
    });
    expect(entities[1]).toMatchObject({
      what: { identifier: { system: AUTH_USER_IDENTIFIER_SYSTEM, value: 'user-1' } },
      description: 'user.registered',
    });
    expect(entities[2]).toMatchObject({ what: { identifier: { value: 'req-1' } }, type: { code: 'XrequestId' } });
  });

  it('should leave the object role off a PractitionerRole entity because it is not the data subject', () => {
    const event = buildUserAuditEvent({
      action: 'update',
      actor: { sub: 'admin-1' },
      userId: 'user-3',
      event: 'user.updated',
      resourceRefs: ['PractitionerRole/role-1'],
    });

    expect((event['entity'] as ReadonlyArray<Record<string, unknown>>)[0]).toEqual({
      what: { reference: 'PractitionerRole/role-1' },
    });
  });

  it('should record outcome 8 with its description when the change stands although a follow-up step failed', () => {
    const event = buildUserAuditEvent({
      action: 'update',
      actor: { sub: 'admin-1' },
      userId: 'user-4',
      event: 'user.updated',
      outcome: 'failed',
      outcomeDesc: 'Patient sync failed',
    });

    expect(event).toMatchObject({ outcome: '8', outcomeDesc: 'Patient sync failed' });
  });

  it('should record outcome 0 and no description when the change succeeded', () => {
    const event = buildUserAuditEvent({ action: 'update', actor: { sub: 'admin-1' }, userId: 'user-5', event: 'user.updated' });

    expect(event['outcome']).toBe('0');
    expect(event).not.toHaveProperty('outcomeDesc');
  });

  it('should use the update action code when an account is deactivated', () => {
    const event = buildUserAuditEvent({
      action: 'update',
      actor: { sub: 'admin-1' },
      userId: 'user-2',
      event: 'user.deactivated',
    });

    expect(event['action']).toBe('U');
    expect(event['entity']).toHaveLength(1);
  });
});

describe('AuditService', () => {
  it('should create the AuditEvent in HAPI when a user change is recorded', async () => {
    const fhir = fakeFhir();
    const service = new AuditService(fhir);

    await service.recordUserChange({ action: 'update', actor: { sub: 'a' }, userId: 'u', event: 'user.updated' });

    expect(fhir.create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ resourceType: 'AuditEvent' }));
  });

  it('should log and resolve when HAPI rejects the AuditEvent', async () => {
    const fhir = fakeFhir();
    fhir.create.mockRejectedValue(new Error('HAPI down'));
    const service = new AuditService(fhir);

    await expect(
      service.recordUserChange({ action: 'update', actor: { sub: 'a' }, userId: 'u', event: 'user.updated' }),
    ).resolves.toBeUndefined();
    const written: FhirResource | undefined = fhir.create.mock.calls[0]?.[1];
    expect(written?.resourceType).toBe('AuditEvent');
  });
});
