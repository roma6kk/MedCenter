import type { FhirResource } from '@medcenter/fhir';

import { toAuditEventRow } from './audit-event.mapper';

/** Exactly what `apps/appointment-service/.../audit.ts` writes, after HAPI assigned ids. */
function appointmentServiceAudit(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'AuditEvent',
    id: 'ae-1',
    meta: { lastUpdated: '2026-10-08T10:00:01.000Z' },
    type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'create' }],
    action: 'C',
    recorded: '2026-10-08T10:00:00.000Z',
    outcome: '0',
    agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
    source: { observer: { display: 'appointment-service' } },
    entity: [{ what: { reference: 'Appointment/appt-1' } }],
    ...overrides,
  };
}

describe('toAuditEventRow', () => {
  it('should map an appointment-service AuditEvent onto the journal row when every field is present', () => {
    const row = toAuditEventRow(appointmentServiceAudit());

    expect(row).toEqual({
      id: 'ae-1',
      occurredAt: new Date('2026-10-08T10:00:00.000Z'),
      userId: 'user-1',
      action: 'create',
      resourceType: 'Appointment',
      resourceId: 'appt-1',
      requestId: null,
      source: 'appointment-service',
    });
  });

  it('should map the R4 action code U to update when no restful subtype is present', () => {
    const row = toAuditEventRow(appointmentServiceAudit({ action: 'U', subtype: undefined }));

    expect(row?.action).toBe('update');
  });

  it('should map the R4 action code D to delete when the event records a deletion', () => {
    expect(toAuditEventRow(appointmentServiceAudit({ action: 'D', subtype: undefined }))?.action).toBe('delete');
  });

  it('should skip read and execute events when the action is not a create, update or delete', () => {
    expect(toAuditEventRow(appointmentServiceAudit({ action: 'R', subtype: undefined }))).toBeUndefined();
    expect(toAuditEventRow(appointmentServiceAudit({ action: 'E', subtype: undefined }))).toBeUndefined();
  });

  it('should strip the version suffix when the entity reference is versioned', () => {
    const row = toAuditEventRow(
      appointmentServiceAudit({ entity: [{ what: { reference: 'Appointment/appt-1/_history/3' } }] }),
    );

    expect(row).toMatchObject({ resourceType: 'Appointment', resourceId: 'appt-1' });
  });

  it('should read the requestId from an entity detail when a service records the correlation id there', () => {
    const row = toAuditEventRow(
      appointmentServiceAudit({
        entity: [
          { what: { reference: 'Encounter/enc-9' }, detail: [{ type: 'requestId', valueString: 'req-42' }] },
        ],
      }),
    );

    expect(row).toMatchObject({ resourceType: 'Encounter', resourceId: 'enc-9', requestId: 'req-42' });
  });

  it('should read the requestId from a BALP XrequestId entity when the service follows IHE BALP', () => {
    const row = toAuditEventRow(
      appointmentServiceAudit({
        entity: [
          { what: { reference: 'Appointment/appt-1' } },
          { type: { code: 'XrequestId' }, what: { identifier: { value: 'req-7' } } },
        ],
      }),
    );

    expect(row).toMatchObject({ resourceId: 'appt-1', requestId: 'req-7' });
  });

  it('should fall back to the agent reference when the agent carries no identifier', () => {
    const row = toAuditEventRow(
      appointmentServiceAudit({ agent: [{ who: { reference: 'PractitionerRole/role-1' }, requestor: true }] }),
    );

    expect(row?.userId).toBe('PractitionerRole/role-1');
  });

  it('should prefer the requesting agent when several agents are listed', () => {
    const row = toAuditEventRow(
      appointmentServiceAudit({
        agent: [
          { who: { identifier: { value: 'system' } }, requestor: false },
          { who: { identifier: { value: 'admin-7' } }, requestor: true },
        ],
      }),
    );

    expect(row?.userId).toBe('admin-7');
  });

  it('should skip a resource without an id or a valid recorded instant when HAPI returns a partial entry', () => {
    expect(toAuditEventRow(appointmentServiceAudit({ id: undefined }))).toBeUndefined();
    expect(toAuditEventRow(appointmentServiceAudit({ recorded: 'not-a-date' }))).toBeUndefined();
  });

  it('should skip a resource that is not an AuditEvent when the search returns an OperationOutcome', () => {
    expect(toAuditEventRow({ resourceType: 'OperationOutcome', id: 'oo-1' })).toBeUndefined();
  });

  describe('bounds of the journal columns (an oversized HAPI value must not break the whole page)', () => {
    const LONG = 'x'.repeat(200);

    it('should clip the user id to the column width when who.identifier.value is 200 characters long', () => {
      const row = toAuditEventRow(appointmentServiceAudit({ agent: [{ who: { identifier: { value: LONG } }, requestor: true }] }));

      expect(row?.userId).toBe('x'.repeat(128));
    });

    it('should clip the user id to the column width when it comes from a long agent reference', () => {
      const row = toAuditEventRow(appointmentServiceAudit({ agent: [{ who: { reference: `PractitionerRole/${LONG}` } }] }));

      expect(row?.userId).toHaveLength(128);
    });

    it('should clip the source to the column width when source.observer.display is 200 characters long', () => {
      const row = toAuditEventRow(appointmentServiceAudit({ source: { observer: { display: LONG } } }));

      expect(row?.source).toBe('x'.repeat(128));
    });

    it('should clip the requestId to the column width when a detail carries a 200 character value', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({
          entity: [{ what: { reference: 'Appointment/appt-1' }, detail: [{ type: 'requestId', valueString: LONG }] }],
        }),
      );

      expect(row?.requestId).toBe('x'.repeat(128));
    });

    it('should clip the requestId to the column width when a BALP XrequestId entity carries it', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({ entity: [{ type: { code: 'XrequestId' }, what: { identifier: { value: LONG } } }] }),
      );

      expect(row?.requestId).toHaveLength(128);
    });

    it('should drop the resource when its type or id would not fit the columns', () => {
      const longType = toAuditEventRow(appointmentServiceAudit({ entity: [{ what: { reference: `${'A'.repeat(70)}/appt-1` } }] }));
      const longId = toAuditEventRow(appointmentServiceAudit({ entity: [{ what: { reference: `Appointment/${'1'.repeat(65)}` } }] }));

      expect(longType).toMatchObject({ resourceType: null, resourceId: null });
      expect(longId).toMatchObject({ resourceType: null, resourceId: null });
    });

    it('should skip the AuditEvent when its own id is longer than the 64 character primary key', () => {
      expect(toAuditEventRow(appointmentServiceAudit({ id: 'a'.repeat(65) }))).toBeUndefined();
    });

    it('should skip the AuditEvent when its id holds characters outside the FHIR id alphabet', () => {
      expect(toAuditEventRow(appointmentServiceAudit({ id: "ae-1'; DROP TABLE x" }))).toBeUndefined();
    });

    it('should strip NUL characters when a value carries one, because PostgreSQL text columns reject them', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({
          agent: [{ who: { identifier: { value: 'user\u0000-1' } }, requestor: true }],
          source: { observer: { display: 'appointment\u0000-service' } },
        }),
      );

      expect(row).toMatchObject({ userId: 'user-1', source: 'appointment-service' });
    });

    it('should fall back to the next user candidate when the first one is only NUL characters', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({ agent: [{ who: { identifier: { value: '\u0000' }, reference: 'Practitioner/p-1' } }] }),
      );

      expect(row?.userId).toBe('Practitioner/p-1');
    });
  });

  describe('auth-service account events (no FHIR resource touched)', () => {
    const accountEntity = {
      what: { identifier: { system: 'https://api.medcenter.by/sid/auth-user', value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } },
      type: { system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type', code: '2', display: 'System Object' },
      name: 'auth.user',
      description: 'user.deactivated',
    };

    it('should show the account as AuthUser/{id} when the event touches no FHIR resource', () => {
      const row = toAuditEventRow(appointmentServiceAudit({ entity: [accountEntity] }));

      expect(row).toMatchObject({ resourceType: 'AuthUser', resourceId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' });
    });

    it('should prefer the FHIR resource over the account when both are listed, as auth-service orders them', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({ entity: [{ what: { reference: 'Patient/pat-1' } }, accountEntity] }),
      );

      expect(row).toMatchObject({ resourceType: 'Patient', resourceId: 'pat-1' });
    });

    it('should leave the resource empty when an identifier belongs to another system', () => {
      const row = toAuditEventRow(
        appointmentServiceAudit({ entity: [{ what: { identifier: { system: 'urn:other', value: 'x-1' } } }] }),
      );

      expect(row).toMatchObject({ resourceType: null, resourceId: null });
    });
  });
});
