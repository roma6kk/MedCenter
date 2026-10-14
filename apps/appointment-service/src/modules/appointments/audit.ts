import type { RequestWithClaims, RequestWithRequestId } from '@medcenter/common';
import type { FhirResource } from '@medcenter/fhir';

import type { TransactionWrite } from './fhir-transaction';

/** An authenticated request after `RequestIdMiddleware` has assigned its correlation id. */
export type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

/** What a clinical write did, who asked for it and through which request (ADR-014, FR-021, NFR-007). */
export interface AuditParams {
  readonly interaction: 'create' | 'update';
  /** Token `sub` of the requesting user. */
  readonly actorSub: string;
  /** Changed resource; may be a `urn:uuid:` fullUrl of a resource created in the same bundle. */
  readonly entityRef: string;
  /** Patient whose appointment changed (FR-021: whose data was touched). */
  readonly patientRef?: string;
  /** `X-Request-Id` of the HTTP request (`RequestIdMiddleware`), the journal's correlation id. */
  readonly requestId?: string;
}

const ACTION_CODE: Readonly<Record<AuditParams['interaction'], 'C' | 'U'>> = { create: 'C', update: 'U' };

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

/** IHE BALP entity type the analytics journal reads the request id from (same as auth-service). */
const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

/**
 * `AuditEvent.entity`: the changed resource first (the journal shows the first
 * relative reference), then the patient and the request id when known.
 */
function entitiesOf(params: AuditParams): ReadonlyArray<Record<string, unknown>> {
  return [
    { what: { reference: params.entityRef } },
    ...(params.patientRef === undefined ? [] : [{ what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE }]),
    ...(params.requestId === undefined ? [] : [{ what: { identifier: { value: params.requestId } }, type: REQUEST_ID_TYPE }]),
  ];
}

/**
 * FHIR `AuditEvent` written inside the same transaction as the clinical change
 * (ADR-014). Same envelope as encounter-/auth-service, so analytics reads one format.
 */
export function buildAuditEvent(params: AuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: params.interaction }],
    action: ACTION_CODE[params.interaction],
    recorded: new Date().toISOString(),
    outcome: '0',
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: 'appointment-service' } },
    entity: entitiesOf(params),
  };
}

/** The `POST AuditEvent` entry that accompanies a clinical write in its transaction Bundle. */
export function auditWrite(params: AuditParams): TransactionWrite {
  return { method: 'POST', url: 'AuditEvent', resource: buildAuditEvent(params) };
}
