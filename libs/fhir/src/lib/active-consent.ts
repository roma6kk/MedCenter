import { ConflictException, HttpStatus } from '@nestjs/common';
import { CONSENT_CODE_SYSTEMS, CONSENT_CODES } from '@medcenter/terminology';

import { isConsentInForce, isEmrConsentOf } from './consent';
import { FhirClientError, type FhirClient, type FhirResource } from './fhir-client.provider';

const FHIR_ID = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

const CANDIDATES = 10;

/** Every consent in force, newest first; concurrent writes can leave several and a revocation must close them all. An unknown Patient (HAPI 404) means no consent. */
export async function listActiveConsents(
  fhir: FhirClient,
  patientId: string,
  now: Date = new Date(),
): Promise<ReadonlyArray<FhirResource>> {
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
    return (result.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource) => isConsentInForce(resource, patientId, now));
  } catch (error) {
    if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
      return [];
    }
    throw error;
  }
}

export async function findActiveConsent(
  fhir: FhirClient,
  patientId: string,
  now: Date = new Date(),
): Promise<FhirResource | null> {
  return (await listActiveConsents(fhir, patientId, now))[0] ?? null;
}

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

const HISTORY_LIMIT = 50;

export async function listConsents(
  fhir: FhirClient,
  patientId: string,
): Promise<ReadonlyArray<FhirResource>> {
  if (!FHIR_ID.test(patientId)) {
    throw new TypeError('patientId must be a FHIR id');
  }
  try {
    const result = await fhir.search('Consent', {
      patient: `Patient/${patientId}`,
      scope: CONSENT_CODES.SCOPE_PATIENT_PRIVACY,
      category: `${CONSENT_CODE_SYSTEMS.CATEGORY}|${CONSENT_CODES.CATEGORY_EMR_PROCESSING}`,
      _sort: '-date',
      _count: HISTORY_LIMIT,
    });
    return (result.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource) => isEmrConsentOf(resource, patientId));
  } catch (error) {
    if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
      return [];
    }
    throw error;
  }
}
