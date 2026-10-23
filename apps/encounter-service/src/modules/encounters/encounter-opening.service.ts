import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import { auditEventByEntityNameQuery } from '../../common/audit/audit-event';
import { checkConsent, CONSENT_ENFORCEMENT_MODE, type ConsentEnforcement } from '../../common/consent/consent-gate';
import { referenceIdOf } from '../../common/fhir/fhir-reference';
import { resourcesOfType } from '../../common/fhir/fhir-search';
import { commitTransaction, idFromLocation, transactionOutcomes, type TransactionWrite } from '../../common/fhir/fhir-transaction';
import type { OpenEncounterResult } from './dto/encounter-response.dto';
import type { OpenEncounterDto } from './dto/open-encounter.dto';
import { appointmentParties, assertAppointmentParticipant } from './encounter-access';
import { internal, stateInvalid } from './encounter-errors';
import { emergencyBypassWrite } from './emergency-bypass';
import {
  buildOpeningWrites,
  encounterOfAppointmentQuery,
  openedEncounterResource,
  openingBypassName,
  serviceTypeOf,
  type OpeningContext,
} from './mappers/encounter-opening.mapper';
import { toEncounterResponse } from './mappers/encounter-view.mapper';

const IN_PROGRESS = 'in-progress';
const BOOKED = 'booked';

/**
 * The bypass event of an opening is keyed by the appointment (`entity-name` of the encounter
 * entity) and conditional: the request that lost the open race adds none.
 */
function openingBypassOnce(write: TransactionWrite, context: OpeningContext): TransactionWrite {
  const name = openingBypassName(context.appointmentId);
  const entities = (write.resource['entity'] as ReadonlyArray<{ what?: { reference?: string } }>).map((entity) =>
    entity.what?.reference === context.fullUrl ? { ...entity, name } : entity,
  );
  return {
    ...write,
    resource: { ...write.resource, entity: entities },
    ifNoneExist: auditEventByEntityNameQuery(name),
  };
}

/**
 * Opening an encounter (API §7.1, FR-010, BR-008).
 *
 * Concurrency: HAPI has no row locks over REST. The Encounter is a conditional create
 * (`ifNoneExist` on the appointment) and the Appointment is written in the same transaction
 * under `If-Match` (see `buildOpeningWrites`), so a concurrent open, cancel or no-show of the
 * same appointment loses with a 409 and nothing of it is stored.
 */
@Injectable()
export class EncounterOpeningService {
  private readonly logger = new Logger(EncounterOpeningService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    @Inject(CONSENT_ENFORCEMENT_MODE) private readonly consentEnforcement: ConsentEnforcement,
  ) {}

  /**
   * 7.1 — one encounter per appointment: a repeated open of an in-progress
   * encounter returns it (`created=false`, 200); a finished one is `409`.
   */
  async open(
    claims: JwtClaims,
    dto: OpenEncounterDto,
    requestId?: string,
  ): Promise<OpenEncounterResult> {
    const roleRef = practitionerRoleRefFromClaims(claims);
    const appointment = await this.fhir.read('Appointment', dto.appointmentId);
    const parties = appointmentParties(appointment);
    // Ownership before state: a non-participant must not learn the appointment's status.
    assertAppointmentParticipant(roleRef, parties);
    if (appointment['status'] !== BOOKED) {
      throw stateInvalid(
        `appointment is ${String(appointment['status'])}, an encounter needs a booked one (BR-008)`,
      );
    }
    const existing = await this.encounterOfAppointment(dto.appointmentId);
    if (existing !== undefined) {
      return this.reopen(existing);
    }
    if (parties.patientRef === undefined) {
      throw internal(`Appointment ${dto.appointmentId} has no patient participant`);
    }
    // ADR-019: before the write; a repeated open of an existing encounter writes nothing and needs no consent.
    const consent = await checkConsent(
      this.fhir,
      this.consentEnforcement,
      parties.patientRef.split('/')[1] ?? '',
      dto.emergencyReason,
    );
    return this.create(
      {
        appointmentId: dto.appointmentId,
        appointment,
        patientRef: parties.patientRef,
        practitionerRoleRef: roleRef,
        serviceType: await this.serviceTypeFor(parties.serviceRef),
        actorSub: claims.sub,
        requestId,
        now: new Date().toISOString(),
        fullUrl: `urn:uuid:${randomUUID()}`,
      },
      consent.bypass ? dto.emergencyReason : undefined,
    );
  }

  private async encounterOfAppointment(appointmentId: string): Promise<FhirResource | undefined> {
    const result = await this.fhir.search('Encounter', {
      appointment: `Appointment/${appointmentId}`,
      _count: 10,
    });
    const encounters = resourcesOfType(result, 'Encounter');
    return encounters.find((encounter) => encounter['status'] === IN_PROGRESS) ?? encounters[0];
  }

  private reopen(existing: FhirResource): OpenEncounterResult {
    if (existing['status'] !== IN_PROGRESS) {
      throw stateInvalid(`the appointment already has a ${String(existing['status'])} encounter`);
    }
    return { created: false, encounter: toEncounterResponse(existing, []) };
  }

  private async create(
    context: OpeningContext,
    emergencyReason: string | undefined,
  ): Promise<OpenEncounterResult> {
    const bypass =
      emergencyReason === undefined
        ? []
        : [
            openingBypassOnce(
              emergencyBypassWrite(
                context.actorSub,
                context.patientRef,
                context.fullUrl,
                emergencyReason,
                context.requestId,
              ),
              context,
            ),
          ];
    const response = await this.commitOpening(context, bypass);
    const outcome = transactionOutcomes(response)[0];
    const encounterId = idFromLocation(outcome?.location);
    if (encounterId === '') {
      throw internal('transaction response has no Encounter id');
    }
    if (outcome?.status.startsWith('201') === true) {
      return {
        created: true,
        encounter: toEncounterResponse(
          { ...openedEncounterResource(context), id: encounterId },
          [],
        ),
      };
    }
    // `200`: `ifNoneExist` matched — a concurrent open of the same appointment created it first.
    this.logger.warn(
      { encounterId, query: encounterOfAppointmentQuery(context.appointmentId) },
      'conditional create matched an existing encounter',
    );
    return this.reopen(await this.fhir.read('Encounter', encounterId));
  }

  /**
   * A 409 means the Appointment moved on since it was read: either a concurrent open won (its
   * encounter is returned) or the appointment was cancelled / marked as a no-show (BR-008).
   */
  private async commitOpening(
    context: OpeningContext,
    bypass: readonly TransactionWrite[],
  ): Promise<FhirResource> {
    try {
      return await commitTransaction(
        this.fhir,
        [...buildOpeningWrites(context), ...bypass],
        'ENCOUNTER_STATE_INVALID',
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }
      const winner = await this.encounterOfAppointment(context.appointmentId);
      if (winner === undefined) {
        throw error;
      }
      return {
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '200 OK', location: `Encounter/${String(winner.id)}` } }],
      };
    }
  }

  /** `Encounter.serviceType` comes from the booked HealthcareService; a deleted service only drops it. */
  private async serviceTypeFor(
    serviceRef: string | undefined,
  ): Promise<Readonly<Record<string, unknown>> | undefined> {
    const serviceId = referenceIdOf(serviceRef, 'HealthcareService');
    if (serviceId === undefined) {
      return undefined;
    }
    try {
      return serviceTypeOf(await this.fhir.read('HealthcareService', serviceId));
    } catch (error) {
      if (error instanceof FhirClientError && error.getStatus() === 404) {
        this.logger.warn(
          { serviceId },
          'HealthcareService of the appointment is gone; Encounter.serviceType left empty',
        );
        return undefined;
      }
      throw error;
    }
  }
}
