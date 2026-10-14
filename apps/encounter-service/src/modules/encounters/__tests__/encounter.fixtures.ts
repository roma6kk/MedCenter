import type { JwtClaims } from '@medcenter/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import type { CompleteEncounterDto } from '../dto/complete-encounter.dto';

export const ENCOUNTER_ID = 'enc-1';
export const APPOINTMENT_ID = '0b9d9a5e-4f7c-4c1e-9d3a-2f1b8e6c7a10';

export const doctorClaims: JwtClaims = {
  sub: 'doctor-user',
  scope: 'user/*.read user/*.write launch',
  role: 'DOCTOR',
  fhirUser: 'PractitionerRole/role-1',
  jti: 'jti-doctor',
};

export const otherDoctorClaims: JwtClaims = { ...doctorClaims, sub: 'other-doctor', fhirUser: 'PractitionerRole/role-9' };

export const adminClaims: JwtClaims = { sub: 'admin-user', scope: 'user/*.read user/*.write', role: 'ADMIN', jti: 'jti-admin' };

export const patientClaims: JwtClaims = {
  sub: 'patient-user',
  scope: 'patient/*.read patient/*.write launch',
  role: 'PATIENT',
  patient: 'pat-1',
  fhirUser: 'Patient/pat-1',
  jti: 'jti-patient',
};

export const bookedAppointment: FhirResource = {
  resourceType: 'Appointment',
  id: APPOINTMENT_ID,
  status: 'booked',
  start: '2026-11-02T09:00:00+03:00',
  participant: [
    { actor: { reference: 'Patient/pat-1' }, status: 'accepted' },
    { actor: { reference: 'PractitionerRole/role-1' }, status: 'accepted' },
    { actor: { reference: 'HealthcareService/svc-1' }, status: 'accepted' },
  ],
  meta: { versionId: '2' },
};

export const healthcareService: FhirResource = {
  resourceType: 'HealthcareService',
  id: 'svc-1',
  type: [{ coding: [{ system: 'https://fhir.by/CodeSystem/nsi-services', code: '10001', display: 'Приём первичный терапевта' }] }],
};

export const inProgressEncounter: FhirResource = {
  resourceType: 'Encounter',
  id: ENCOUNTER_ID,
  status: 'in-progress',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  subject: { reference: 'Patient/pat-1' },
  participant: [{ individual: { reference: 'PractitionerRole/role-1' } }],
  appointment: [{ reference: `Appointment/${APPOINTMENT_ID}` }],
  period: { start: '2026-11-02T06:00:00.000Z' },
  meta: { versionId: '1' },
};

export const finishedEncounter: FhirResource = { ...inProgressEncounter, status: 'finished', meta: { versionId: '2' } };

export function validCompleteDto(): CompleteEncounterDto {
  return {
    summary: 'Жалобы на заложенность носа, субфебрилитет',
    diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей', verificationStatus: 'confirmed' }],
    recommendations: 'Обильное тёплое питьё, контроль температуры',
    observations: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-observations', code: '20006', value: 36.6, unit: 'Cel' }],
    serviceRequests: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: '10008', note: 'Натощак' }],
    medicationRequests: [{ atcCode: 'J01FA10', dosageText: '1 таб 1 раз в день 3 дня' }],
  };
}

export function createFhirMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

/** `$validate-code` answer: `Parameters` with `result` (and `display` for a known code). */
export function validateCodeAnswer(isKnown: boolean, display = 'Отображение'): FhirResource {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'result', valueBoolean: isKnown },
      ...(isKnown ? [{ name: 'display', valueString: display }] : [{ name: 'message', valueString: 'Unknown code' }]),
    ],
  };
}

/** `transaction-response` with one `201 Created` entry per location. */
export function transactionResponse(locations: readonly string[]): FhirResource {
  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: locations.map((location) => ({ response: { status: '201 Created', location } })),
  };
}

export interface CommittedEntry {
  readonly fullUrl?: string;
  readonly resource: FhirResource;
  readonly request: Readonly<Record<string, unknown>>;
}

/** Entries of the n-th transaction Bundle sent through `fhir.batch`. */
export function committedEntries(fhir: jest.Mocked<FhirClient>, call = 0): readonly CommittedEntry[] {
  const bundle = fhir.batch.mock.calls[call]?.[0] as unknown as { entry?: CommittedEntry[] } | undefined;
  return bundle?.entry ?? [];
}

/** Error payload (`{ errorCode, message }`) of an `HttpException` thrown by `promise`. */
export async function errorPayloadOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse(): unknown }).getResponse();
  }
  throw new Error('expected the promise to reject');
}
