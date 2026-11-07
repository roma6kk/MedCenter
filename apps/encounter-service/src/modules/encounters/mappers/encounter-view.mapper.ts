import type { FhirResource } from '@medcenter/fhir';

import { arrayField, firstCoding, referenceField, stringField } from '../../../common/fhir/fhir-read';
import { parseReference, referenceIdOf } from '../../../common/fhir/fhir-reference';
import type { EncounterDetailsDto, EncounterResponseDto, EncounterStatus } from '../dto/encounter-response.dto';
import { encounterPractitionerRoleRefs } from '../encounter-access';
import {
  medicationRequestView,
  observationView,
  ofType,
  rankedDiagnoses,
  relatedTo,
  serviceRequestView,
  viewsOf,
} from './clinical-view.mapper';

const ENCOUNTER_STATUSES: ReadonlySet<string> = new Set<EncounterStatus>([
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
  'cancelled',
  'entered-in-error',
  'unknown',
]);

function isEncounterStatus(value: string | undefined): value is EncounterStatus {
  return value !== undefined && ENCOUNTER_STATUSES.has(value);
}

export function encounterStatusOf(encounter: FhirResource): EncounterStatus {
  const status = stringField(encounter, 'status');
  return isEncounterStatus(status) ? status : 'unknown';
}

export function appointmentIdOf(encounter: FhirResource): string {
  return referenceIdOf(stringField(arrayField(encounter, 'appointment')[0], 'reference'), 'Appointment') ?? '';
}

function periodOf(encounter: FhirResource): EncounterResponseDto['period'] {
  const period = encounter['period'];
  const end = stringField(period, 'end');
  return { start: stringField(period, 'start') ?? '', ...(end === undefined ? {} : { end }) };
}

export function toEncounterResponse(encounter: FhirResource, diagnosisCodes: readonly string[]): EncounterResponseDto {
  const roleRef = encounterPractitionerRoleRefs(encounter)[0];
  return {
    id: encounter.id ?? '',
    status: encounterStatusOf(encounter),
    period: periodOf(encounter),
    diagnosisCodes: [...diagnosisCodes],
    appointmentId: appointmentIdOf(encounter),
    patientId: referenceIdOf(referenceField(encounter, 'subject'), 'Patient') ?? '',
    practitionerRoleId: parseReference(roleRef)?.id ?? '',
  };
}

export function toEncounterDetails(encounter: FhirResource, related: readonly FhirResource[]): EncounterDetailsDto {
  const own = relatedTo(`Encounter/${encounter.id ?? ''}`, related);
  const diagnoses = rankedDiagnoses(encounter, ofType(own, 'Condition'));
  const serviceType = firstCoding(encounter, 'serviceType');
  const summary = stringField(ofType(own, 'ClinicalImpression')[0], 'summary');
  const recommendations = stringField(ofType(own, 'CarePlan')[0], 'description');
  return {
    ...toEncounterResponse(encounter, diagnoses.map((diagnosis) => diagnosis.code)),
    ...(serviceType === undefined ? {} : { serviceType }),
    ...(summary === undefined ? {} : { summary }),
    ...(recommendations === undefined ? {} : { recommendations }),
    diagnoses,
    observations: viewsOf(ofType(own, 'Observation'), observationView),
    serviceRequests: viewsOf(ofType(own, 'ServiceRequest'), serviceRequestView),
    medicationRequests: viewsOf(ofType(own, 'MedicationRequest'), medicationRequestView),
  };
}
