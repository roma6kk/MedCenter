import type { FhirResource } from '@medcenter/fhir';

import { SYSTEM_OBJECT, requestIdEntities, type AuditActor } from './audit-event.builder';

/** Identifier system of a bundled terminology snapshot inside `AuditEvent.entity`. */
export const TERMINOLOGY_SNAPSHOT_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/terminology-snapshot';

/** Where the import stands: `started` is written when the request is accepted, the others when the job ends. */
export type TerminologyImportStage = 'started' | 'completed' | 'failed';

export interface TerminologyImportAuditParams {
  readonly stage: TerminologyImportStage;
  readonly actor: AuditActor;
  readonly snapshotVersion: string;
  /** Correlates the `started` and the final event of one import. */
  readonly importId: string;
  /** `Type/id` of the CodeSystems/ValueSets the import wrote (the final event only). */
  readonly resourceRefs?: ReadonlyArray<string>;
  /** Short, client-safe reason of a failed import. */
  readonly failure?: string;
}

const MAX_OUTCOME_DESCRIPTION = 500;

/**
 * R4 `AuditEvent` of a terminology import (FR-021, ADR-014). The import rewrites
 * reference data, so it is an `update` in the analytics journal's own terms
 * (the journal does not keep `execute` events). FHIR resources come first in
 * `entity`, followed by the snapshot as a System Object. A failed import is
 * `outcome` `8` (serious failure) with the reason in `outcomeDesc`.
 */
export function buildTerminologyImportAuditEvent(params: TerminologyImportAuditParams): FhirResource {
  const failed = params.stage === 'failed';
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'update' }],
    action: 'U',
    recorded: new Date().toISOString(),
    outcome: failed ? '8' : '0',
    ...(failed && params.failure !== undefined ? { outcomeDesc: params.failure.slice(0, MAX_OUTCOME_DESCRIPTION) } : {}),
    agent: [{ who: { identifier: { value: params.actor.sub } }, requestor: true }],
    source: { observer: { display: 'auth-service' } },
    entity: [
      ...(params.resourceRefs ?? []).map((reference) => ({ what: { reference } })),
      {
        what: { identifier: { system: TERMINOLOGY_SNAPSHOT_IDENTIFIER_SYSTEM, value: params.snapshotVersion } },
        type: SYSTEM_OBJECT,
        name: 'terminology-snapshot',
        description: `terminology.import.${params.stage} ${params.importId}`,
      },
      ...requestIdEntities(params.actor.requestId),
    ],
  };
}
