import type { FhirResource } from '@medcenter/fhir';

import { SYSTEM_OBJECT, requestIdEntities, type AuditActor } from './audit-event.builder';

export const CLINIC_SETTINGS_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/clinic-settings';

export interface ClinicAuditParams {
  readonly actor: AuditActor;
  readonly changedFields: ReadonlyArray<string>;
}

export function buildClinicAuditEvent(params: ClinicAuditParams): FhirResource {
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
    outcome: '0',
    agent: [{ who: { identifier: { value: params.actor.sub } }, requestor: true }],
    source: { observer: { display: 'auth-service' } },
    entity: [
      {
        what: { identifier: { system: CLINIC_SETTINGS_IDENTIFIER_SYSTEM, value: 'clinic' } },
        type: SYSTEM_OBJECT,
        name: 'auth.clinic_settings',
        description: `clinic.updated: ${params.changedFields.join(', ')}`,
      },
      ...requestIdEntities(params.actor.requestId),
    ],
  };
}
