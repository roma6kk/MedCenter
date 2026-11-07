import type { RequestWithClaims, RequestWithRequestId } from '@medcenter/common';
import type { FhirResource, TransactionWrite } from '@medcenter/fhir';

export type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

export interface AuditParams {
  readonly interaction: 'create' | 'update';
  readonly actorSub: string;
  readonly entityRef: string;
  readonly patientRef?: string;
  readonly requestId?: string;
}

const ACTION_CODE: Readonly<Record<AuditParams['interaction'], 'C' | 'U'>> = { create: 'C', update: 'U' };

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

/** The changed resource goes first: the analytics journal shows the first relative reference. */
function entitiesOf(params: AuditParams): ReadonlyArray<Record<string, unknown>> {
  return [
    { what: { reference: params.entityRef } },
    ...(params.patientRef === undefined ? [] : [{ what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE }]),
    ...(params.requestId === undefined ? [] : [{ what: { identifier: { value: params.requestId } }, type: REQUEST_ID_TYPE }]),
  ];
}

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

export function auditWrite(params: AuditParams): TransactionWrite {
  return { method: 'POST', url: 'AuditEvent', resource: buildAuditEvent(params) };
}
