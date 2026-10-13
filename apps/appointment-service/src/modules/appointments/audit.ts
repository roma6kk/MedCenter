import type { FhirResource } from '@medcenter/fhir';

/**
 * FHIR `AuditEvent` written inside the same transaction as the clinical change
 * (ADR-014). `entityRef` may be a `urn:uuid:` fullUrl of a resource created in
 * the same bundle.
 */
export function buildAuditEvent(params: {
  readonly action: 'C' | 'U';
  readonly subtype: 'create' | 'update';
  readonly actorSub: string;
  readonly entityRef: string;
}): FhirResource {
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
    source: { observer: { display: 'appointment-service' } },
    entity: [{ what: { reference: params.entityRef } }],
  };
}
