import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FHIR_CLIENT, outboxWrite, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import {
  checkConsent,
  CONSENT_ENFORCEMENT_MODE,
  type ConsentEnforcement,
} from '../../common/consent/consent-gate';
import { referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference } from '../../common/fhir/fhir-reference';
import { resourcesOf } from '../../common/fhir/fhir-search';
import { commitTransaction } from '../../common/fhir/fhir-transaction';
import { internal, stateInvalid } from './encounter-errors';
import { emergencyBypassWrite } from './emergency-bypass';
import { completedEvent } from '../events/encounter-events';
import {
  TerminologyValidatorService,
  type TerminologyDisplays,
} from '../terminology/terminology-validator.service';
import type { CompleteEncounterDto } from './dto/complete-encounter.dto';
import type {
  EncounterDetailsDto,
  EncounterResponseDto,
} from './dto/encounter-response.dto';
import { assertEncounterParticipant, resolveEncounterReaderRoleRef } from './encounter-access';
import {
  buildCompletionPlan,
  icd10RefsOf,
  terminologyRefsOf,
  type CompletionContext,
} from './mappers/encounter-completion.mapper';
import {
  appointmentIdOf,
  toEncounterDetails,
  toEncounterResponse,
} from './mappers/encounter-view.mapper';

const IN_PROGRESS = 'in-progress';
const BOOKED = 'booked';

const ENCOUNTER_REVINCLUDES: readonly string[] = [
  'Condition:encounter',
  'ClinicalImpression:encounter',
  'CarePlan:encounter',
  'Observation:encounter',
  'ServiceRequest:encounter',
  'MedicationRequest:encounter',
];

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

@Injectable()
export class EncountersService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly terminology: TerminologyValidatorService,
    @Inject(CONSENT_ENFORCEMENT_MODE) private readonly consentEnforcement: ConsentEnforcement,
  ) {}

  async findOne(claims: JwtClaims, encounterId: string): Promise<EncounterDetailsDto> {
    const roleRef = resolveEncounterReaderRoleRef(claims);
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
    assertEncounterParticipant(roleRef, encounter);
    return toEncounterDetails(encounter, resources);
  }

  async complete(
    claims: JwtClaims,
    encounterId: string,
    dto: CompleteEncounterDto,
    requestId?: string,
  ): Promise<EncounterResponseDto> {
    const roleRef = practitionerRoleRefFromClaims(claims);
    const loaded = await this.loadCompletable(roleRef, encounterId);
    // ADR-019: before terminology lookups and the transaction.
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
          emergencyBypassWrite(
            claims.sub,
            loaded.patientRef,
            `Encounter/${encounterId}`,
            dto.emergencyReason,
            requestId,
          ),
        ]
      : [];
    // The outbox event is written in the transaction that completes the encounter (published by outbox-relay, ADR-021);
    // only the diagnosis count goes into it, never codes or names (health data).
    const event = completedEvent({
      encounterId,
      patientRef: loaded.patientRef,
      practitionerRef: roleRef,
      diagnosisCount: dto.diagnoses.length,
    });
    await commitTransaction(this.fhir, [...plan.writes, ...bypass, outboxWrite(event)], 'ENCOUNTER_STATE_INVALID');
    return toEncounterResponse(
      { ...plan.finishedEncounter, id: encounterId },
      dto.diagnoses.map((diagnosis) => diagnosis.code),
    );
  }

  // Order matters: non-participant 403 first (state is not revealed), then state 409, then appointment 409.
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

  // The appointment is returned as read: its version guards the `fulfilled` update.
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
