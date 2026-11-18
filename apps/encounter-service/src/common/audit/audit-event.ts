import type { FhirResource } from '@medcenter/fhir';

interface AuditEventParams {
  readonly action: 'C' | 'U';
  readonly subtype: 'create' | 'update';
  readonly actorSub: string;
  readonly entityRefs: readonly string[];
  readonly patientRef: string;
  readonly requestId?: string;
  // Stable key of the write: makes the AuditEvent a conditional create, so a request that lost a race adds no second event.
  readonly entityName?: string;
}

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

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

export function auditEventByEntityNameQuery(entityName: string): string {
  return `AuditEvent?entity-name:exact=${encodeURIComponent(entityName)}`;
}
