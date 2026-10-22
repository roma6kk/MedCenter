import type { FhirResource } from './fhir-client.provider';
import { PATIENT_OBJECT_ROLE, REQUEST_ID_TYPE } from './patient-read-audit';

const RESTFUL_TYPE = {
  system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
  code: 'rest',
  display: 'RESTful Operation',
} as const;
const RESTFUL_INTERACTION = 'http://hl7.org/fhir/restful-interaction';

function requestIdEntities(requestId: string | undefined): ReadonlyArray<Record<string, unknown>> {
  return requestId === undefined
    ? []
    : [{ what: { identifier: { value: requestId } }, type: REQUEST_ID_TYPE }];
}

/** A consent write: the `Consent` or its scan `Binary` created or changed (ADR-014, same envelope as the other write events). */
export interface ConsentWriteAuditParams {
  readonly interaction: 'create' | 'update';
  readonly actorSub: string;
  /** Changed resource; may be a `urn:uuid:` fullUrl of a resource created in the same bundle. */
  readonly entityRef: string;
  readonly patientRef: string;
  readonly source: string;
  readonly requestId?: string;
}

export function buildConsentWriteAuditEvent(params: ConsentWriteAuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: RESTFUL_TYPE,
    subtype: [{ system: RESTFUL_INTERACTION, code: params.interaction }],
    action: params.interaction === 'create' ? 'C' : 'U',
    recorded: new Date().toISOString(),
    outcome: '0',
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: params.source } },
    entity: [
      { what: { reference: params.entityRef } },
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
      ...requestIdEntities(params.requestId),
    ],
  };
}

/** A download of the scan of a consent form; always journalled, by any user (design §5). */
export interface ScanReadAuditParams {
  readonly outcome: 'success' | 'denied';
  readonly actorSub: string;
  readonly binaryRef: string;
  readonly patientRef: string;
  readonly source: string;
  readonly requestId?: string;
}

export function buildScanReadAuditEvent(params: ScanReadAuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: RESTFUL_TYPE,
    subtype: [{ system: RESTFUL_INTERACTION, code: 'read' }],
    action: 'R',
    recorded: new Date().toISOString(),
    outcome: params.outcome === 'success' ? '0' : '4',
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: params.source } },
    entity: [
      { what: { reference: params.binaryRef } },
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
      ...requestIdEntities(params.requestId),
    ],
  };
}

/** A doctor proceeded without the patient's consent because it could not be given (`emergencyReason`, ADR-019). */
export interface EmergencyBypassAuditParams {
  readonly actorSub: string;
  readonly patientRef: string;
  /** Free-text reason the doctor gave. */
  readonly reason: string;
  /** The `Encounter` (7.1/7.3) the bypass served, when known. */
  readonly contextRef?: string;
  readonly source: string;
  readonly requestId?: string;
}

const EMERGENCY_TREATMENT = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
  code: 'ETREAT',
  display: 'Emergency Treatment',
} as const;

export function buildEmergencyBypassAuditEvent(params: EmergencyBypassAuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110113',
      display: 'Security Alert',
    },
    subtype: [{ system: 'urn:medcenter:audit-event-subtype', code: 'consent-emergency-bypass' }],
    action: 'E',
    recorded: new Date().toISOString(),
    outcome: '0',
    purposeOfEvent: [{ coding: [EMERGENCY_TREATMENT], text: params.reason }],
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: params.source } },
    entity: [
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
      ...(params.contextRef === undefined ? [] : [{ what: { reference: params.contextRef } }]),
      ...requestIdEntities(params.requestId),
    ],
  };
}
