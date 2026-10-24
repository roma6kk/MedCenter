import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirResource } from '@medcenter/fhir';

import { AppModule } from '../src/app/app.module';
import { CONSENT_ENFORCEMENT_MODE, type ConsentEnforcement } from '../src/common/consent/consent-gate';
import { applyE2eEnv } from './e2e-env';
import { FakeHapi } from './fake-hapi';
import { startTestIssuer, type TestIssuer, type TestTokenClaims } from './test-tokens';

/** Codes the fake terminology server knows: the seed subset the scenarios use. */
export const SEEDED_CODES: readonly string[] = ['J06.9', 'I10', 'J01FA10', 'N02BE01', 'Cel', '20006', '10008'];

export const APPOINTMENT_ID = 'apt-1';

export interface AppHarness {
  readonly app: INestApplication;
  readonly hapi: FakeHapi;
  readonly issuer: TestIssuer;
  close(): Promise<void>;
}

/**
 * Boots the real `AppModule` — global guard stack, validation pipe, RFC 7807
 * filter — over an in-memory HAPI, so the HTTP contract is tested without HAPI.
 * The service no longer publishes events itself (outbox, ADR-021).
 */
export async function startAppHarness(consentEnforcement: ConsentEnforcement = 'warn'): Promise<AppHarness> {
  applyE2eEnv();
  const issuer = await startTestIssuer();
  process.env['JWT_JWKS_URI'] = issuer.jwksUri;
  const hapi = new FakeHapi(SEEDED_CODES);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(hapi)
    .overrideProvider(CONSENT_ENFORCEMENT_MODE)
    .useValue(consentEnforcement)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  return {
    app,
    hapi,
    issuer,
    close: async () => {
      await app.close();
      await issuer.close();
    },
  };
}

export const DOCTOR: TestTokenClaims = {
  sub: 'doctor-user',
  role: 'DOCTOR',
  scope: 'user/*.read user/*.write launch',
  fhirUser: 'PractitionerRole/role-1',
};

export const OTHER_DOCTOR: TestTokenClaims = { ...DOCTOR, sub: 'other-doctor', fhirUser: 'PractitionerRole/role-9' };

export const ADMIN: TestTokenClaims = { sub: 'admin-user', role: 'ADMIN', scope: 'user/*.read user/*.write' };

export const PATIENT: TestTokenClaims = {
  sub: 'patient-user',
  role: 'PATIENT',
  scope: 'patient/*.read patient/*.write launch',
  patient: 'pat-1',
  fhirUser: 'Patient/pat-1',
};

/** The booked appointment of `Patient/pat-1` with `PractitionerRole/role-1`, as appointment-service writes it. */
export function bookedAppointment(): FhirResource {
  return {
    resourceType: 'Appointment',
    id: APPOINTMENT_ID,
    status: 'booked',
    start: '2026-11-02T09:00:00+03:00',
    end: '2026-11-02T09:30:00+03:00',
    participant: [
      { actor: { reference: 'Patient/pat-1' }, status: 'accepted' },
      { actor: { reference: 'PractitionerRole/role-1' }, status: 'accepted' },
      { actor: { reference: 'HealthcareService/svc-1' }, status: 'accepted' },
    ],
  };
}

/** An `emr-processing` consent in force for `Patient/pat-1` (what patient-service 3.8 writes). */
export function activeConsent(period?: { start?: string; end?: string }): FhirResource {
  return {
    resourceType: 'Consent',
    id: 'consent-1',
    status: 'active',
    scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
    category: [{ coding: [{ system: 'urn:medcenter:consent-category', code: 'emr-processing' }] }],
    patient: { reference: 'Patient/pat-1' },
    dateTime: '2026-10-01',
    provision: { type: 'permit', ...(period === undefined ? {} : { period }) },
  };
}

export function healthcareService(): FhirResource {
  return {
    resourceType: 'HealthcareService',
    id: 'svc-1',
    type: [{ coding: [{ system: 'https://fhir.by/CodeSystem/nsi-services', code: '10001', display: 'Приём первичный терапевта' }] }],
  };
}

/** API §7.3 body of the plan's E2E: `J06.9` / `36.6 Cel` / `J01FA10`. */
export function completeBody(diagnosisCode = 'J06.9'): Record<string, unknown> {
  return {
    summary: 'Жалобы на заложенность носа, субфебрилитет',
    diagnoses: [{ code: diagnosisCode, display: 'Острая инфекция верхних дыхательных путей', verificationStatus: 'confirmed' }],
    recommendations: 'Обильное тёплое питьё, контроль температуры',
    observations: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-observations', code: '20006', value: 36.6, unit: 'Cel' }],
    serviceRequests: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: '10008', note: 'Натощак' }],
    medicationRequests: [{ atcCode: 'J01FA10', dosageText: '1 таб 1 раз в день 3 дня' }],
  };
}
