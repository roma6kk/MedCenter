import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

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
import { EncounterPublisherService } from '../events/encounter-publisher.service';
import {
  TerminologyValidatorService,
  type TerminologyDisplays,
} from '../terminology/terminology-validator.service';
import type { CompleteEncounterDto } from './dto/complete-encounter.dto';
import type {
  EncounterDetailsDto,
  EncounterResponseDto,
} from './dto/encounter-response.dto';
import {
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

/**
 * Reading and completing an encounter (API §7.2–7.3, FR-011…FR-014, BR-003/004/005/008/009);
 * opening is `EncounterOpeningService`.
 *
 * Concurrency: HAPI has no row locks over REST. Completing writes every resource
 * in one `transaction` Bundle whose `PUT Encounter` and `PUT Appointment`
 * (`fulfilled`, BR-008) carry `If-Match` on the versions that were read, so a
 * concurrent or replayed completion, or an appointment cancelled / marked as a
 * no-show meanwhile, loses with `409 ENCOUNTER_STATE_INVALID` and nothing of it
 * is stored.
 */
@Injectable()
export class EncountersService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly terminology: TerminologyValidatorService,
    private readonly events: EncounterPublisherService,
    @Inject(CONSENT_ENFORCEMENT_MODE) private readonly consentEnforcement: ConsentEnforcement,
  ) {}

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
          emergencyBypassWrite(
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
