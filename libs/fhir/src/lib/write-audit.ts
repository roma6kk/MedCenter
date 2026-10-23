import type { FhirResource } from './fhir-client.provider';
import { REQUEST_ID_TYPE } from './patient-read-audit';
import type { TransactionWrite } from './fhir-transaction';

/** Who asked for a write and through which request: the token `sub` and the `X-Request-Id` (NFR-007). */
export interface WriteActor {
  readonly sub: string;
  readonly requestId?: string;
}

/** A write of a resource that holds no patient data (catalog, rooms, schedules): ADR-014, FR-021. */
export interface WriteAuditParams {
  readonly interaction: 'create' | 'update' | 'delete';
  readonly actor: WriteActor;
  /** Type and FHIR id of the changed resource. */
  readonly resourceType: string;
  readonly resourceId: string;
  /** Service that made the write (`AuditEvent.source.observer`). */
  readonly source: string;
}

/**
 * `AuditEvent.entity.what.identifier.system` of a changed resource that an admin can delete. The event
 * names it by a logical reference (`Reference.type` + this identifier holding the FHIR id) instead of a
 * literal `Type/id`: HAPI enforces referential integrity on delete, and an event that pointed at the
 * resource would make it undeletable. The journal reads it like a literal reference (analytics `resourceOf`).
 */
export const FHIR_RESOURCE_ID_SYSTEM = 'https://api.medcenter.by/sid/fhir-resource-id';

const ACTION_CODE = { create: 'C', update: 'U', delete: 'D' } as const;

/**
 * FHIR `AuditEvent` of an administrative write, in the same envelope as the clinical
 * write events (`buildConsentWriteAuditEvent`, encounter-/appointment-service), so the
 * analytics journal reads one format.
 */
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

/** The `POST AuditEvent` entry that rides in the transaction Bundle of the write it records. */
export function writeAuditEntry(params: WriteAuditParams): TransactionWrite {
  return { method: 'POST', url: 'AuditEvent', resource: buildWriteAuditEvent(params) };
}
