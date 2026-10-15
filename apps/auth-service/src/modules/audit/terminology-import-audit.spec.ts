import type { FhirClient } from '@medcenter/fhir';

import { AuditService } from './audit.service';
import {
  TERMINOLOGY_SNAPSHOT_IDENTIFIER_SYSTEM,
  buildTerminologyImportAuditEvent,
} from './terminology-import-audit.builder';

const BASE = { actor: { sub: 'admin-1', requestId: 'req-9' }, snapshotVersion: '1.4.463', importId: 'imp-1' } as const;

function entitiesOf(event: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> {
  return event['entity'] as ReadonlyArray<Record<string, unknown>>;
}

describe('buildTerminologyImportAuditEvent', () => {
  it('should record the requesting agent as an update the journal keeps when an import is accepted', () => {
    const event = buildTerminologyImportAuditEvent({ ...BASE, stage: 'started' });

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'U',
      outcome: '0',
      subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'update' }],
      agent: [{ who: { identifier: { value: 'admin-1' } }, requestor: true }],
      source: { observer: { display: 'auth-service' } },
    });
  });

  it('should name the snapshot and the import when the event is built', () => {
    const entities = entitiesOf(buildTerminologyImportAuditEvent({ ...BASE, stage: 'started' }));

    expect(entities[0]).toMatchObject({
      what: { identifier: { system: TERMINOLOGY_SNAPSHOT_IDENTIFIER_SYSTEM, value: '1.4.463' } },
      description: 'terminology.import.started imp-1',
    });
    expect(entities[1]).toMatchObject({ what: { identifier: { value: 'req-9' } }, type: { code: 'XrequestId' } });
  });

  it('should list the written resources before the snapshot when the import completed', () => {
    const entities = entitiesOf(
      buildTerminologyImportAuditEvent({ ...BASE, stage: 'completed', resourceRefs: ['ValueSet/vs-atc', 'CodeSystem/cs-atc'] }),
    );

    expect(entities.slice(0, 2)).toEqual([
      { what: { reference: 'ValueSet/vs-atc' } },
      { what: { reference: 'CodeSystem/cs-atc' } },
    ]);
  });

  it('should flag a serious failure with a bounded reason when the import failed', () => {
    const event = buildTerminologyImportAuditEvent({ ...BASE, stage: 'failed', failure: 'x'.repeat(900) });

    expect(event['outcome']).toBe('8');
    expect(event['outcomeDesc']).toHaveLength(500);
  });
});

describe('AuditService.recordTerminologyImport', () => {
  function fakeFhir(): jest.Mocked<FhirClient> {
    return { create: jest.fn().mockResolvedValue({ resourceType: 'AuditEvent', id: 'ae-1' }) } as unknown as jest.Mocked<FhirClient>;
  }

  it('should create the AuditEvent in HAPI when an import stage is recorded', async () => {
    const fhir = fakeFhir();

    await new AuditService(fhir).recordTerminologyImport({ ...BASE, stage: 'started' });

    expect(fhir.create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ action: 'U' }));
  });

  it('should log and resolve when HAPI rejects the AuditEvent', async () => {
    const fhir = fakeFhir();
    fhir.create.mockRejectedValue(new Error('HAPI down'));

    await expect(new AuditService(fhir).recordTerminologyImport({ ...BASE, stage: 'started' })).resolves.toBeUndefined();
  });
});
