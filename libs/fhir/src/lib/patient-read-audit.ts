import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { FHIR_CLIENT, type FhirClient, type FhirResource } from './fhir-client.provider';

export interface PatientReadAuditParams {
  readonly interaction: 'read' | 'search-type';
  readonly outcome: 'success' | 'denied';
  readonly actorSub: string;
  readonly patientRef: string;
  readonly source: string;
  readonly requestId?: string;
}

export const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

export const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

export function buildPatientReadAuditEvent(params: PatientReadAuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: params.interaction }],
    action: params.interaction === 'read' ? 'R' : 'E',
    recorded: new Date().toISOString(),
    outcome: params.outcome === 'success' ? '0' : '4',
    agent: [{ who: { identifier: { value: params.actorSub } }, requestor: true }],
    source: { observer: { display: params.source } },
    entity: [
      { what: { reference: params.patientRef }, role: PATIENT_OBJECT_ROLE },
      ...(params.requestId === undefined
        ? []
        : [{ what: { identifier: { value: params.requestId } }, type: REQUEST_ID_TYPE }]),
    ],
  };
}

export interface PatientReadActor {
  readonly sub: string;
  readonly role: string;
}

function isCompartmentRefusal(error: unknown): boolean {
  if (!(error instanceof ForbiddenException)) {
    return false;
  }
  const body = error.getResponse();
  return typeof body === 'object' && (body as { errorCode?: unknown }).errorCode === 'COMPARTMENT_VIOLATION';
}

/** Fire-and-forget, a failure is only logged: the audit must not hold up or cancel a clinical answer. */
@Injectable()
export class PatientReadAudit {
  private readonly logger = new Logger(PatientReadAudit.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  record(params: PatientReadAuditParams): void {
    const logFailure = (error: unknown): void => {
      this.logger.error(
        { err: error, requestId: params.requestId, patientRef: params.patientRef },
        'Read AuditEvent was not stored',
      );
    };
    try {
      this.fhir.create('AuditEvent', buildPatientReadAuditEvent(params)).catch(logFailure);
    } catch (error) {
      logFailure(error);
    }
  }

  async audited<T>(
    actor: PatientReadActor,
    patientId: string,
    context: Pick<PatientReadAuditParams, 'interaction' | 'source' | 'requestId'>,
    read: () => Promise<T>,
  ): Promise<T> {
    const event = (outcome: PatientReadAuditParams['outcome']): PatientReadAuditParams => ({
      ...context,
      outcome,
      actorSub: actor.sub,
      patientRef: `Patient/${patientId}`,
    });
    let result: T;
    try {
      result = await read();
    } catch (error) {
      if (isCompartmentRefusal(error)) {
        this.record(event('denied'));
      }
      throw error;
    }
    if (actor.role !== Role.PATIENT) {
      this.record(event('success'));
    }
    return result;
  }
}
