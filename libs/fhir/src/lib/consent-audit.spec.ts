import {
  buildConsentWriteAuditEvent,
  buildEmergencyBypassAuditEvent,
  buildScanReadAuditEvent,
} from './consent-audit';

type Entity = Record<string, unknown>;
const entitiesOf = (event: Record<string, unknown>): Entity[] => event['entity'] as Entity[];

describe('buildConsentWriteAuditEvent', () => {
  const base = {
    interaction: 'create',
    actorSub: 'user-a',
    entityRef: 'urn:uuid:1',
    patientRef: 'Patient/1442',
    source: 'patient-service',
    requestId: 'req-1',
  } as const;

  it('should use the write envelope of ADR-014: rest, create, action C, outcome 0', () => {
    expect(buildConsentWriteAuditEvent(base)).toMatchObject({
      resourceType: 'AuditEvent',
      type: { code: 'rest' },
      subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'create' }],
      action: 'C',
      outcome: '0',
      agent: [{ who: { identifier: { value: 'user-a' } }, requestor: true }],
      source: { observer: { display: 'patient-service' } },
    });
  });

  it('should map an update to action U', () => {
    expect(buildConsentWriteAuditEvent({ ...base, interaction: 'update' })).toMatchObject({
      action: 'U',
      subtype: [{ code: 'update' }],
    });
  });

  it('should name the changed resource first, then the patient and the request id', () => {
    const entities = entitiesOf(buildConsentWriteAuditEvent(base));

    expect(entities[0]).toMatchObject({ what: { reference: 'urn:uuid:1' } });
    expect(entities[1]).toMatchObject({ what: { reference: 'Patient/1442' }, role: { code: '1' } });
    expect(entities[2]).toMatchObject({
      what: { identifier: { value: 'req-1' } },
      type: { code: 'XrequestId' },
    });
  });
});

describe('buildScanReadAuditEvent', () => {
  const base = {
    outcome: 'success',
    actorSub: 'user-d',
    binaryRef: 'Binary/bin-1',
    patientRef: 'Patient/1442',
    source: 'patient-service',
    requestId: 'req-2',
  } as const;

  it('should journal a scan download as a read of the Binary, naming the patient', () => {
    const event = buildScanReadAuditEvent(base);

    expect(event).toMatchObject({ action: 'R', outcome: '0', subtype: [{ code: 'read' }] });
    expect(entitiesOf(event)[0]).toMatchObject({ what: { reference: 'Binary/bin-1' } });
    expect(entitiesOf(event)[1]).toMatchObject({
      what: { reference: 'Patient/1442' },
      role: { code: '1' },
    });
  });

  it('should mark a refused download with outcome 4', () => {
    expect(buildScanReadAuditEvent({ ...base, outcome: 'denied' })).toMatchObject({ outcome: '4' });
  });
});

describe('buildEmergencyBypassAuditEvent', () => {
  const base = {
    actorSub: 'user-d',
    patientRef: 'Patient/1442',
    reason: 'Пациент без сознания, согласие получить нельзя',
    contextRef: 'Encounter/e1',
    source: 'encounter-service',
    requestId: 'req-3',
  } as const;

  it('should be a security event of its own with the emergency reason as the purpose of the event', () => {
    const event = buildEmergencyBypassAuditEvent(base);

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'E',
      outcome: '0',
      subtype: [{ code: 'consent-emergency-bypass' }],
      purposeOfEvent: [{ coding: [{ code: 'ETREAT' }], text: base.reason }],
      source: { observer: { display: 'encounter-service' } },
    });
  });

  it('should name the patient and the encounter or appointment the bypass served', () => {
    const entities = entitiesOf(buildEmergencyBypassAuditEvent(base));

    expect(entities[0]).toMatchObject({ what: { reference: 'Patient/1442' }, role: { code: '1' } });
    expect(entities[1]).toMatchObject({ what: { reference: 'Encounter/e1' } });
  });

  it('should leave out the context entity when none is known', () => {
    const entities = entitiesOf(
      buildEmergencyBypassAuditEvent({ ...base, contextRef: undefined, requestId: undefined }),
    );

    expect(entities).toHaveLength(1);
  });
});
