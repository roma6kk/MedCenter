import type { FhirResource } from '@medcenter/fhir';

import { SYSTEM_OBJECT, requestIdEntities, type AuditActor } from './audit-event.builder';

export const TERMINOLOGY_SNAPSHOT_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/terminology-snapshot';

export type TerminologyImportStage = 'started' | 'completed' | 'failed';

export interface TerminologyImportAuditParams {
  readonly stage: TerminologyImportStage;
  readonly actor: AuditActor;
  readonly snapshotVersion: string;
  readonly importId: string;
  readonly resourceRefs?: ReadonlyArray<string>;
  readonly failure?: string;
}

const MAX_OUTCOME_DESCRIPTION = 500;

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
