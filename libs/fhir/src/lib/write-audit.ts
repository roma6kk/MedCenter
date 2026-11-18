import type { FhirResource } from './fhir-client.provider';
import { REQUEST_ID_TYPE } from './patient-read-audit';
import type { TransactionWrite } from './fhir-transaction';

export interface WriteActor {
  readonly sub: string;
  readonly requestId?: string;
}

export interface WriteAuditParams {
  readonly interaction: 'create' | 'update' | 'delete';
  readonly actor: WriteActor;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly source: string;
}

/** Names a deletable resource by a logical reference, not `Type/id`: HAPI's referential integrity would make it undeletable. */
export const FHIR_RESOURCE_ID_SYSTEM = 'https://api.medcenter.by/sid/fhir-resource-id';

const ACTION_CODE = { create: 'C', update: 'U', delete: 'D' } as const;

export function buildWriteAuditEvent(params: WriteAuditParams): FhirResource {
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
    agent: [{ who: { identifier: { value: params.actor.sub } }, requestor: true }],
    source: { observer: { display: params.source } },
    entity: [
      { what: { type: params.resourceType, identifier: { system: FHIR_RESOURCE_ID_SYSTEM, value: params.resourceId } } },
      ...(params.actor.requestId === undefined
        ? []
        : [{ what: { identifier: { value: params.actor.requestId } }, type: REQUEST_ID_TYPE }]),
    ],
  };
}

export function writeAuditEntry(params: WriteAuditParams): TransactionWrite {
  return { method: 'POST', url: 'AuditEvent', resource: buildWriteAuditEvent(params) };
}
