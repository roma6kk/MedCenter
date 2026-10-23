import type { FhirResource } from '@medcenter/fhir';

export interface AuditEventParams {
  readonly action: 'C' | 'U';
  readonly subtype: 'create' | 'update';
  readonly actorSub: string;
  /** Changed resources; the first one is the primary entity. May be `urn:uuid:` fullUrls of the same bundle. */
  readonly entityRefs: readonly string[];
  /** Patient whose record changed (FR-021: whose data was touched). */
  readonly patientRef: string;
  /** `X-Request-Id` of the HTTP request (`RequestIdMiddleware`), the journal's correlation id (NFR-007). */
  readonly requestId?: string;
  /**
   * Stable key of the one write this event records (`AuditEvent.entity[0].name`, searchable as
   * `entity-name`): lets the bundle entry be a conditional create, so a request that lost a race
   * and changed nothing adds no second event.
   */
  readonly entityName?: string;
}

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

/** IHE BALP entity type the analytics journal reads the request id from (same as appointment- and auth-service). */
const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

/**
 * FHIR `AuditEvent` written inside the same transaction as the clinical change
 * (ADR-014). Same shape as appointment-service so analytics reads one format.
 */
export function buildAuditEvent(params: AuditEventParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: params.subtype }],
    action: params.action,
    recorded: new Date().toISOString(),
    outcome: '0',
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: 'encounter-service' } },
    entity: [
      ...params.entityRefs.map((reference, index) => ({
        what: { reference },
        ...(index === 0 && params.entityName !== undefined ? { name: params.entityName } : {}),
      })),
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
      ...(params.requestId === undefined ? [] : [{ what: { identifier: { value: params.requestId } }, type: REQUEST_ID_TYPE }]),
    ],
  };
}

/** `ifNoneExist` of a keyed AuditEvent: HAPI returns the stored event (`200`) instead of creating a second one. */
export function auditEventByEntityNameQuery(entityName: string): string {
  return `AuditEvent?entity-name:exact=${encodeURIComponent(entityName)}`;
}
