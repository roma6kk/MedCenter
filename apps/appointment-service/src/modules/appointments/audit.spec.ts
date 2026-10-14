import { auditWrite, buildAuditEvent } from './audit';

type Entity = Readonly<Record<string, unknown>>;

function entitiesOf(resource: Readonly<Record<string, unknown>>): readonly Entity[] {
  return resource['entity'] as readonly Entity[];
}

describe('buildAuditEvent', () => {
  it('should record the requesting user, the restful subtype and the changed resource first when an appointment is updated', () => {
    // Arrange
    const params = { interaction: 'update', actorSub: 'user-1', entityRef: 'Appointment/apt-1' } as const;

    // Act
    const event = buildAuditEvent(params);

    // Assert
    expect(event).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'U',
      subtype: [{ code: 'update' }],
      agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
      source: { observer: { display: 'appointment-service' } },
    });
    expect(entitiesOf(event)[0]).toEqual({ what: { reference: 'Appointment/apt-1' } });
  });

  it('should name the patient whose appointment changed when the patient is known', () => {
    // Arrange
    const params = { interaction: 'create', actorSub: 'user-1', entityRef: 'urn:uuid:1', patientRef: 'Patient/pat-1' } as const;

    // Act
    const event = buildAuditEvent(params);

    // Assert
    expect(entitiesOf(event)).toContainEqual({
      what: { reference: 'Patient/pat-1' },
      role: { system: 'http://terminology.hl7.org/CodeSystem/object-role', code: '1', display: 'Patient' },
    });
  });

  it('should carry the X-Request-Id as an IHE BALP XrequestId entity when the request has one', () => {
    // Arrange
    const params = { interaction: 'update', actorSub: 'doc-1', entityRef: 'Appointment/apt-1', requestId: 'req-42' } as const;

    // Act
    const event = buildAuditEvent(params);

    // Assert
    expect(entitiesOf(event)).toContainEqual({
      what: { identifier: { value: 'req-42' } },
      type: { system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType', code: 'XrequestId' },
    });
  });

  it('should list only the changed resource when neither patient nor request id is known', () => {
    // Arrange
    const params = { interaction: 'update', actorSub: 'adm-1', entityRef: 'Appointment/apt-1' } as const;

    // Act
    const event = buildAuditEvent(params);

    // Assert
    expect(entitiesOf(event)).toHaveLength(1);
  });
});

describe('auditWrite', () => {
  it('should POST the AuditEvent inside the transaction when a clinical write is committed', () => {
    // Arrange
    const params = { interaction: 'create', actorSub: 'user-1', entityRef: 'urn:uuid:1' } as const;

    // Act
    const write = auditWrite(params);

    // Assert
    expect(write).toMatchObject({ method: 'POST', url: 'AuditEvent', resource: { resourceType: 'AuditEvent', action: 'C' } });
  });
});
