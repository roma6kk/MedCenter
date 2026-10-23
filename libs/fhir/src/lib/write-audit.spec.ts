import { buildWriteAuditEvent, FHIR_RESOURCE_ID_SYSTEM, writeAuditEntry } from './write-audit';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

describe('buildWriteAuditEvent', () => {
  it.each([
    ['create', 'C'],
    ['update', 'U'],
    ['delete', 'D'],
  ] as const)('should build the restful %s event with action %s in the envelope the journal reads', (interaction, action) => {
    const event = buildWriteAuditEvent({ interaction, actor: ACTOR, resourceType: 'Location', resourceId: 'room-1', source: 'practitioner-service' });

    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
      subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: interaction }],
      action,
      outcome: '0',
      agent: [{ who: { identifier: { value: 'admin-1' } }, requestor: true }],
      source: { observer: { display: 'practitioner-service' } },
      entity: [
        { what: { type: 'Location', identifier: { system: FHIR_RESOURCE_ID_SYSTEM, value: 'room-1' } } },
        {
          what: { identifier: { value: 'req-1' } },
          type: { system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType', code: 'XrequestId' },
        },
      ],
    });
    expect(Number.isNaN(Date.parse(String(event['recorded'])))).toBe(false);
  });

  it('should name the resource by a logical reference, never a literal one, so HAPI can still delete it', () => {
    const event = buildWriteAuditEvent({ interaction: 'create', actor: ACTOR, resourceType: 'Schedule', resourceId: 's-1', source: 'catalog-service' });

    expect(JSON.stringify(event)).not.toContain('"reference"');
  });

  it('should leave the request id entity out when the request has none', () => {
    const event = buildWriteAuditEvent({ interaction: 'create', actor: { sub: 'admin-1' }, resourceType: 'Schedule', resourceId: 's-1', source: 'catalog-service' });

    expect(event['entity']).toHaveLength(1);
  });
});

describe('writeAuditEntry', () => {
  it('should be a POST AuditEvent entry', () => {
    const entry = writeAuditEntry({ interaction: 'create', actor: ACTOR, resourceType: 'Schedule', resourceId: 's-1', source: 'catalog-service' });

    expect(entry).toMatchObject({ method: 'POST', url: 'AuditEvent', resource: { resourceType: 'AuditEvent' } });
  });
});
