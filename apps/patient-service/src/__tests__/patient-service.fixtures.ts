import type { JwtClaims } from '@medcenter/common';
import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

/**
 * Shared unit-test fixtures of patient-service: the JWT claims auth-service
 * issues per role, a Jest double of the HAPI client and the care resources
 * that prove a doctor ↔ patient relationship. `tsconfig.app.json` excludes
 * every `__tests__` directory, so none of this ships with the service.
 */

export const PATIENT_ID = '9f2c';
export const ROLE_ID = 'role-1';

export const patientClaims: JwtClaims = {
  sub: 'user-p',
  scope: 'patient/*.read patient/*.write launch',
  role: 'PATIENT',
  patient: PATIENT_ID,
  fhirUser: `Patient/${PATIENT_ID}`,
  jti: 'jti-p',
};

export const doctorClaims: JwtClaims = {
  sub: 'user-d',
  scope: 'user/*.read user/*.write launch',
  role: 'DOCTOR',
  fhirUser: `PractitionerRole/${ROLE_ID}`,
  jti: 'jti-d',
};

export const adminClaims: JwtClaims = {
  sub: 'user-a',
  scope: 'user/*.read user/*.write launch',
  role: 'ADMIN',
  jti: 'jti-a',
};

export const patientResource: FhirResource = {
  resourceType: 'Patient',
  id: PATIENT_ID,
  name: [{ family: 'Иванов', given: ['Иван'] }],
  birthDate: '1990-05-12',
  gender: 'male',
};

/** Appointment as appointment-service writes it (`participant[].actor`). */
export const sharedAppointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  participant: [
    { actor: { reference: `Patient/${PATIENT_ID}` }, status: 'accepted' },
    { actor: { reference: `PractitionerRole/${ROLE_ID}` }, status: 'accepted' },
  ],
};

/** Encounter as encounter-service writes it (`subject`, `participant[].individual`). */
export const sharedEncounter: FhirResource = {
  resourceType: 'Encounter',
  id: 'enc-1',
  status: 'finished',
  subject: { reference: `Patient/${PATIENT_ID}` },
  participant: [{ individual: { reference: `PractitionerRole/${ROLE_ID}` } }],
};

/** Search answer whose `total` equals the number of entries. */
export function bundleOf(...resources: FhirResource[]): FhirSearchResult {
  return { total: resources.length, entry: resources.map((resource) => ({ resource })) };
}

/** HAPI double: every search is empty unless a test says otherwise. */
export function createFhirClientMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue(bundleOf()),
    read: jest.fn().mockResolvedValue(patientResource),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

/** Answers `search` per resource type; unlisted types get an empty bundle. */
export function searchAnswering(
  answers: Readonly<Record<string, FhirSearchResult>>,
): (resourceType: string) => Promise<FhirSearchResult> {
  return async (resourceType) => answers[resourceType] ?? bundleOf();
}

/** Error payload (`{ errorCode, message }`) of a rejected call to a Nest service. */
export async function errorPayloadOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse(): unknown }).getResponse();
  }
  throw new Error('expected the promise to reject');
}

/** HTTP status of a rejected call to a Nest service (`HttpException.getStatus()`). */
export async function errorStatusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (error) {
    return (error as { getStatus(): number }).getStatus();
  }
  throw new Error('expected the promise to reject');
}
