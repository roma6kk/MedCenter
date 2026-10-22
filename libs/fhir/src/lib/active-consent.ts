import { ConflictException, HttpStatus } from '@nestjs/common';
import { CONSENT_CODE_SYSTEMS, CONSENT_CODES } from '@medcenter/terminology';

import { isConsentInForce } from './consent';
import { FhirClientError, type FhirClient, type FhirResource } from './fhir-client.provider';

/** FHIR R4 `id` (`[A-Za-z0-9\-.]{1,64}`), without the dot-only values that collapse a URL path. */
const FHIR_ID = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

/** More than one candidate, because the newest may have expired while an older one still holds. */
const CANDIDATES = 10;

/**
 * The `emr-processing` consent in force for a patient (design §2.3): HAPI
 * narrows by patient, scope, category and status, then every candidate is
 * re-checked in process, including its period. `null` when there is none.
 * HAPI answers a reference search on an unknown Patient with 404; that means
 * "no consent", not NOT_FOUND. Any other upstream failure propagates.
 */
export async function findActiveConsent(
  fhir: FhirClient,
  patientId: string,
  now: Date = new Date(),
): Promise<FhirResource | null> {
  if (!FHIR_ID.test(patientId)) {
    throw new TypeError('patientId must be a FHIR id');
  }
  try {
    const result = await fhir.search('Consent', {
      patient: `Patient/${patientId}`,
      scope: CONSENT_CODES.SCOPE_PATIENT_PRIVACY,
      category: `${CONSENT_CODE_SYSTEMS.CATEGORY}|${CONSENT_CODES.CATEGORY_EMR_PROCESSING}`,
      status: 'active',
      _sort: '-date',
      _count: CANDIDATES,
    });
    return (
      (result.entry ?? [])
        .map((entry) => entry.resource)
        .find((resource) => isConsentInForce(resource, patientId, now)) ?? null
    );
  } catch (error) {
    if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
      return null;
    }
    throw error;
  }
}

/**
 * Returns the consent in force or throws `409 CONSENT_REQUIRED` (API §1,
 * ADR-019). Services call it before they write clinical data; whether the
 * refusal is enforced or only logged is their `CONSENT_ENFORCEMENT` decision.
 */
export async function assertActiveConsent(
  fhir: FhirClient,
  patientId: string,
  now: Date = new Date(),
): Promise<FhirResource> {
  const consent = await findActiveConsent(fhir, patientId, now);
  if (consent === null) {
    throw new ConflictException({
      errorCode: 'CONSENT_REQUIRED',
      message:
        'CONSENT_REQUIRED: the patient has no active consent to the electronic medical record',
    });
  }
  return consent;
}
