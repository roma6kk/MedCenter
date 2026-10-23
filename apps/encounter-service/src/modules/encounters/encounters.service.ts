import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { buildEmergencyBypassAuditEvent } from '@medcenter/fhir';
import { practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import {
  checkConsent,
  CONSENT_ENFORCEMENT_MODE,
  type ConsentEnforcement,
} from '../../common/consent/consent-gate';
import { auditEventByEntityNameQuery } from '../../common/audit/audit-event';
import { referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference, referenceIdOf } from '../../common/fhir/fhir-reference';
import { resourcesOf, resourcesOfType } from '../../common/fhir/fhir-search';
import {
  commitTransaction,
  idFromLocation,
  transactionOutcomes,
  type TransactionWrite,
} from '../../common/fhir/fhir-transaction';
import { EncounterPublisherService } from '../events/encounter-publisher.service';
import {
  TerminologyValidatorService,
  type TerminologyDisplays,
} from '../terminology/terminology-validator.service';
import type { CompleteEncounterDto } from './dto/complete-encounter.dto';
import type {
  EncounterDetailsDto,
  EncounterResponseDto,
  OpenEncounterResult,
} from './dto/encounter-response.dto';
import type { OpenEncounterDto } from './dto/open-encounter.dto';
import {
  appointmentParties,
  assertAppointmentParticipant,
  assertEncounterParticipant,
  assertViewerSeesEncounter,
  resolveEncounterViewer,
} from './encounter-access';
import {
  buildCompletionPlan,
  icd10RefsOf,
  terminologyRefsOf,
  type CompletionContext,
} from './mappers/encounter-completion.mapper';
import {
  buildOpeningWrites,
  encounterOfAppointmentQuery,
  openedEncounterResource,
  openingBypassName,
  serviceTypeOf,
  type OpeningContext,
} from './mappers/encounter-opening.mapper';
import {
  appointmentIdOf,
  toEncounterDetails,
  toEncounterResponse,
} from './mappers/encounter-view.mapper';

const IN_PROGRESS = 'in-progress';
const BOOKED = 'booked';

/** Everything API §7.2 shows comes back in one search through `_revinclude`. */
const ENCOUNTER_REVINCLUDES: readonly string[] = [
  'Condition:encounter',
  'ClinicalImpression:encounter',
  'CarePlan:encounter',
  'Observation:encounter',
  'ServiceRequest:encounter',
  'MedicationRequest:encounter',
];

/** What `complete` needs from HAPI before it writes: the in-progress encounter and its booked appointment. */
interface CompletableEncounter {
  readonly encounter: FhirResource;
  readonly appointment: FhirResource;
  readonly patientRef: string;
}

interface CompletionInputs extends CompletableEncounter {
  readonly encounterId: string;
  readonly roleRef: string;
  readonly actorSub: string;
  readonly requestId?: string;
  readonly displays: TerminologyDisplays;
}

function completionContextOf(inputs: CompletionInputs): CompletionContext {
  return {
    encounter: inputs.encounter,
    encounterId: inputs.encounterId,
    appointment: inputs.appointment,
    appointmentId: appointmentIdOf(inputs.encounter),
    patientRef: inputs.patientRef,
    practitionerRoleRef: inputs.roleRef,
    actorSub: inputs.actorSub,
    requestId: inputs.requestId,
    now: new Date().toISOString(),
    displays: inputs.displays,
    newFullUrl: (): string => `urn:uuid:${randomUUID()}`,
  };
}

function stateInvalid(message: string): ConflictException {
  return new ConflictException({
    errorCode: 'ENCOUNTER_STATE_INVALID',
    message: `ENCOUNTER_STATE_INVALID: ${message}`,
  });
}

function internal(message: string): InternalServerErrorException {
  return new InternalServerErrorException({
    errorCode: 'INTERNAL',
    message: `INTERNAL: ${message}`,
  });
}

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
 * Encounter lifecycle (API §7.1–7.3, FR-010…FR-014, BR-003/004/005/008/009).
 *
 * Concurrency: HAPI has no row locks over REST. Opening uses a conditional
 * create (`ifNoneExist` on the appointment); completing writes every resource
 * in one `transaction` Bundle whose `PUT Encounter` and `PUT Appointment`
 * (`fulfilled`, BR-008) carry `If-Match` on the versions that were read, so a
 * concurrent or replayed completion, or an appointment cancelled / marked as a
 * no-show meanwhile, loses with `409 ENCOUNTER_STATE_INVALID` and nothing of it
 * is stored.
 */
@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly terminology: TerminologyValidatorService,
    private readonly events: EncounterPublisherService,
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

  /** 7.2 — the encounter and its clinical content, for its participant doctor or an admin. */
  async findOne(claims: JwtClaims, encounterId: string): Promise<EncounterDetailsDto> {
    const viewer = resolveEncounterViewer(claims);
    const result = await this.fhir.search('Encounter', {
      _id: encounterId,
      _revinclude: ENCOUNTER_REVINCLUDES,
    });
    const resources = resourcesOf(result);
    const encounter = resources.find(
      (resource) => resource.resourceType === 'Encounter' && resource.id === encounterId,
    );
    if (encounter === undefined) {
      throw new NotFoundException({
        errorCode: 'NOT_FOUND',
        message: `NOT_FOUND: Encounter ${encounterId} does not exist`,
      });
    }
    assertViewerSeesEncounter(viewer, encounter);
    return toEncounterDetails(encounter, resources);
  }

  /** 7.3 — state and terminology are checked before any write; then one atomic transaction. */
  async complete(
    claims: JwtClaims,
    encounterId: string,
    dto: CompleteEncounterDto,
    requestId?: string,
  ): Promise<EncounterResponseDto> {
    const roleRef = practitionerRoleRefFromClaims(claims);
    const loaded = await this.loadCompletable(roleRef, encounterId);
    // ADR-019: before terminology lookups and before the transaction.
    const consent = await checkConsent(
      this.fhir,
      this.consentEnforcement,
      loaded.patientRef.split('/')[1] ?? '',
      dto.emergencyReason,
    );
    await this.terminology.assertIcd10Codes(icd10RefsOf(dto));
    const displays = await this.terminology.assertCodesExist(terminologyRefsOf(dto));
    const plan = buildCompletionPlan(
      completionContextOf({
        ...loaded,
        encounterId,
        roleRef,
        actorSub: claims.sub,
        requestId,
        displays,
      }),
      dto,
    );
    const bypass = consent.bypass
      ? [
          this.bypassWrite(
            claims.sub,
            loaded.patientRef,
            `Encounter/${encounterId}`,
            dto.emergencyReason,
            requestId,
          ),
        ]
      : [];
    await commitTransaction(this.fhir, [...plan.writes, ...bypass], 'ENCOUNTER_STATE_INVALID');

    // After the commit: a broker failure is logged by the publisher and cannot undo the completion.
    const diagnoses = dto.diagnoses.map((diagnosis) => ({
      code: diagnosis.code,
      display: diagnosis.display,
    }));
    await this.events.publishCompleted({
      encounterId,
      patientRef: loaded.patientRef,
      practitionerRef: roleRef,
      diagnoses,
    });
    return toEncounterResponse(
      { ...plan.finishedEncounter, id: encounterId },
      diagnoses.map((diagnosis) => diagnosis.code),
    );
  }

  /**
   * Reads the encounter and refuses, before any terminology lookup or write:
   * a non-participant (403, checked first so the state is not revealed), an
   * encounter that is not in progress (409, BR-003) and an appointment that is
   * no longer booked (409, BR-008).
   */
  private async loadCompletable(
    roleRef: string,
    encounterId: string,
  ): Promise<CompletableEncounter> {
    const encounter = await this.fhir.read('Encounter', encounterId);
    assertEncounterParticipant(roleRef, encounter);
    if (encounter['status'] !== IN_PROGRESS) {
      throw stateInvalid(
        `encounter is ${String(encounter['status'])}, only an in-progress one can be completed (BR-003)`,
      );
    }
    const patientRef = canonicalReference(referenceField(encounter, 'subject'), 'Patient');
    if (patientRef === undefined) {
      throw internal(`Encounter ${encounterId} has no Patient subject`);
    }
    const appointment = await this.readStillBookedAppointment(encounter);
    return { encounter, appointment, patientRef };
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
              this.bypassWrite(
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

  /** The emergency-bypass AuditEvent rides in the clinical transaction: no bypass without its journal entry (ADR-019). */
  private bypassWrite(
    actorSub: string,
    patientRef: string,
    contextRef: string,
    reason: string | undefined,
    requestId?: string,
  ): TransactionWrite {
    return {
      method: 'POST',
      url: 'AuditEvent',
      resource: buildEmergencyBypassAuditEvent({
        actorSub,
        patientRef,
        reason: reason ?? '',
        contextRef,
        source: 'encounter-service',
        requestId,
      }),
    };
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

  /**
   * BR-008: a cancelled or no-show appointment cannot get a completed encounter.
   * The appointment is returned as read: its version guards the `fulfilled` update.
   */
  private async readStillBookedAppointment(encounter: FhirResource): Promise<FhirResource> {
    const appointmentId = appointmentIdOf(encounter);
    if (appointmentId === '') {
      throw stateInvalid('encounter is not linked to an appointment');
    }
    const appointment = await this.fhir.read('Appointment', appointmentId);
    if (appointment['status'] !== BOOKED) {
      throw stateInvalid(`appointment is ${String(appointment['status'])}`);
    }
    return appointment;
  }
}
