import type { FhirClient } from '@medcenter/fhir';

import { AuditService } from './audit.service';
import { CLINIC_SETTINGS_IDENTIFIER_SYSTEM, buildClinicAuditEvent } from './clinic-audit.builder';

describe('clinic audit', () => {
  it('should name the agent, the changed fields and the request id', () => {
    const event = buildClinicAuditEvent({ actor: { sub: 'admin-1', requestId: 'req-1' }, changedFields: ['phone', 'hours'] });

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'U',
      outcome: '0',
      agent: [{ who: { identifier: { value: 'admin-1' } }, requestor: true }],
    });
    const entities = event['entity'] as ReadonlyArray<Record<string, unknown>>;
    expect(entities[0]).toMatchObject({
      what: { identifier: { system: CLINIC_SETTINGS_IDENTIFIER_SYSTEM, value: 'clinic' } },
      description: 'clinic.updated: phone, hours',
    });
    expect(entities[1]).toMatchObject({ what: { identifier: { value: 'req-1' } } });
  });

  it('should not rethrow when the audit store is down', async () => {
    const fhir = { create: jest.fn().mockRejectedValue(new Error('down')) } as unknown as FhirClient;

    await expect(
      new AuditService(fhir).recordClinicChange({ actor: { sub: 'admin-1' }, changedFields: ['name'] }),
    ).resolves.toBeUndefined();
  });
});
