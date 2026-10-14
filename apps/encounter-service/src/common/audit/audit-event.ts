import type { FhirResource } from '@medcenter/fhir';

export interface AuditEventParams {
  readonly action: 'C' | 'U';
  readonly subtype: 'create' | 'update';
  readonly actorSub: string;
  /** Changed resources; the first one is the primary entity. May be `urn:uuid:` fullUrls of the same bundle. */
  readonly entityRefs: readonly string[];
  /** Patient whose record changed (FR-021: whose data was touched). */
  readonly patientRef: string;
}

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
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
      ...params.entityRefs.map((reference) => ({ what: { reference } })),
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
    ],
  };
}
