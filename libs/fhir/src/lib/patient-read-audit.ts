import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { FHIR_CLIENT, type FhirClient, type FhirResource } from './fhir-client.provider';

/** One read of a patient's personal data (ADR-018, D-3): who, whose, through which request, and whether it was allowed. */
export interface PatientReadAuditParams {
  /** `read` for a single resource, `search-type` for a list. */
  readonly interaction: 'read' | 'search-type';
  /** `denied` is a refused read (`COMPARTMENT_VIOLATION`), written as `AuditEvent.outcome` 4. */
  readonly outcome: 'success' | 'denied';
  /** Token `sub` of the requesting user. */
  readonly actorSub: string;
  /** `Patient/{id}` whose data was read or asked for. */
  readonly patientRef: string;
  /** Service that answered the request (`AuditEvent.source.observer`). */
  readonly source: string;
  /** `X-Request-Id` of the HTTP request, the journal's correlation id (NFR-007). */
  readonly requestId?: string;
}

/** `AuditEvent.entity.role` of the patient whose data was touched (shared with the consent events). */
export const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

/** IHE BALP entity type the analytics journal reads the request id from (same as the write-side builders). */
export const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

/**
 * FHIR `AuditEvent` of a read: same envelope as the write-side events (ADR-014),
 * `action` R (read) or E (search), `outcome` 0 or 4. It names the patient and
 * the request only — never the response body.
 */
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

/** The requesting user as the JWT guard knows them (`JwtClaims.sub` / `.role`). */
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

/**
 * Writes the `AuditEvent` of a patient-data read (ADR-018, D-3). The write is
 * not awaited and a failure is only logged (fail-open): the audit must not
 * hold up or cancel a clinical answer. A read of the record by its owner is
 * not recorded — callers decide that.
 */
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

  /**
   * Runs `read` and journals it (ADR-018, D-3): a doctor's or administrator's
   * successful read, and every refused read (403 `COMPARTMENT_VIOLATION`). A
   * patient reading their own record is not recorded; other failures (404, 502,
   * a missing scope) are not either, because no data was exposed or withheld
   * by the compartment rule.
   */
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
