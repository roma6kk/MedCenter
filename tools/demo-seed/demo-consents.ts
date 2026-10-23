import { createHash } from 'node:crypto';

import { buildConsent, isConsentInForce } from '@medcenter/fhir';

import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { seedResourceId } from '../shared/deterministic-id';
import { DOCTORS, type PatientDef } from './demo-catalog';
import { demoIds } from './demo-ids';

/**
 * EMR consent of the demo patients (`seed:demo -- --consents`, API 3.4-3.11, ADR-019).
 *
 * Without it the encounter gate answers `409 CONSENT_REQUIRED` for every demo patient. The step
 * writes straight into HAPI, like the rest of the FHIR seed: a small demo "scan" as a `Binary`
 * (`securityContext=Patient/{id}`), then the `Consent` built by the same `buildConsent` that
 * patient-service uses for 3.8, so both have one shape. Ids are deterministic (`PUT`).
 *
 * One demo patient is left WITHOUT consent on purpose, to show the block (default
 * `patient.novikov`, `--consent-except=<account>` or `--consent-except=none` changes it).
 * Re-running is safe: a patient who already has a consent in force is skipped.
 */

/** The demo patient the seed deliberately leaves without consent (the demo of the `CONSENT_REQUIRED` block). */
export const DEFAULT_PATIENT_WITHOUT_CONSENT = 'patient.novikov';

/** The medical worker "who signed the paper form" in the demo: the first demo doctor. */
const SIGNER_DOCTOR_KEY = 'ivanova';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMAL_PDF_LIMIT = 4096;

/** `patient.kuznetsov` -> `kuznetsov`. */
export function consentKeyOf(patient: Pick<PatientDef, 'emailLocal'>): string {
  return patient.emailLocal.replace(/^patient\./, '');
}

/**
 * A tiny, valid one-page PDF ("DEMO scan"). It starts with the `%PDF-` signature, the only thing
 * 3.10 checks, and differs per patient so the stored hashes differ too.
 */
export function demoScanPdf(key: string): Buffer {
  const stream = `BT /F1 14 Tf 40 100 Td (DEMO consent scan - ${key.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdf = Buffer.from(body, 'latin1');
  if (pdf.length > MINIMAL_PDF_LIMIT) {
    throw new Error('the demo scan grew past its size budget');
  }
  return pdf;
}

/** Base64 SHA-1 of the bytes: what 3.10 returns and `Consent.sourceAttachment.hash` carries. */
export function scanHash(bytes: Buffer): string {
  return createHash('sha1').update(bytes).digest('base64');
}

export interface PlannedDemoConsent {
  readonly binary: FhirResource;
  readonly consent: FhirResource;
}

function signerOf(): { readonly reference: string; readonly name: string } {
  const doctor = DOCTORS.find((candidate) => candidate.key === SIGNER_DOCTOR_KEY);
  if (doctor === undefined) {
    throw new Error(`Unknown demo doctor "${SIGNER_DOCTOR_KEY}"`);
  }
  return {
    reference: `PractitionerRole/${demoIds.practitionerRole(doctor.key)}`,
    name: `${doctor.family} ${doctor.given} ${doctor.patronymic}`,
  };
}

/**
 * Pure: the `Binary` and the active `Consent` of one demo patient. The form is dated the day before
 * the run: a date-only `period.start` is read as UTC midnight, so "today" could still lie ahead.
 */
export function planDemoConsent(patient: PatientDef, patientId: string, now: Date): PlannedDemoConsent {
  const key = consentKeyOf(patient);
  const bytes = demoScanPdf(key);
  const binary: FhirResource = {
    resourceType: 'Binary',
    id: seedResourceId('Binary', `consent-scan/${key}`),
    contentType: 'application/pdf',
    data: bytes.toString('base64'),
    securityContext: { reference: `Patient/${patientId}` },
  };
  const consent = buildConsent({
    patientId,
    status: 'active',
    formNumber: `DEMO-${key}`,
    signedAt: new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10),
    performerRef: `Patient/${patientId}`,
    consenterType: 'self',
    signer: signerOf(),
    scan: { binaryId: binary.id ?? '', contentType: 'application/pdf', hash: scanHash(bytes) },
  });
  return { binary, consent: { ...consent, id: seedResourceId('Consent', `emr/${key}`) } };
}

export interface ConsentSelection {
  readonly withConsent: readonly PatientDef[];
  readonly withoutConsent: readonly PatientDef[];
}

/**
 * Pure: the demo patients that have an account in the manifest, split into those who get a consent and
 * the one left without it. An excluded account that is not a demo patient is a typo, not a no-op.
 */
export function selectConsentPatients(
  catalog: readonly PatientDef[],
  registeredEmails: readonly string[],
  exceptAccount: string | undefined,
): ConsentSelection {
  if (exceptAccount !== undefined && !catalog.some((patient) => patient.emailLocal === exceptAccount)) {
    throw new Error(`--consent-except: "${exceptAccount}" is not a demo patient (${catalog.map((patient) => patient.emailLocal).join(', ')}, or none)`);
  }
  const registered = catalog.filter((patient) => registeredEmails.some((email) => email.split('@')[0] === patient.emailLocal));
  return {
    withConsent: registered.filter((patient) => patient.emailLocal !== exceptAccount),
    withoutConsent: registered.filter((patient) => patient.emailLocal === exceptAccount),
  };
}

export interface DemoConsentsSummary {
  readonly created: readonly string[];
  readonly alreadyActive: readonly string[];
  /** Left without consent on purpose. */
  readonly withoutConsent: readonly string[];
  /** Demo patients with no `Patient` on the server (account not registered yet). */
  readonly missing: readonly string[];
}

export interface DemoConsentsOptions extends ConsentSelection {
  readonly now: Date;
}

async function hasConsentInForce(http: FhirHttp, patientId: string, now: Date): Promise<boolean> {
  const found = await http.search('Consent', {
    patient: `Patient/${patientId}`,
    scope: 'patient-privacy',
    status: 'active',
  });
  return found.some((consent) => isConsentInForce(consent, patientId, now));
}

/** Idempotent: every demo patient but the excluded one ends up with exactly one consent in force. */
export async function seedDemoConsents(http: FhirHttp, options: DemoConsentsOptions): Promise<DemoConsentsSummary> {
  const created: string[] = [];
  const alreadyActive: string[] = [];
  const missing: string[] = [];
  for (const patient of options.withConsent) {
    const [found] = await http.search('Patient', { family: patient.lastName, given: patient.firstName, birthdate: patient.birthDate });
    const patientId = found?.id;
    if (patientId === undefined) {
      missing.push(patient.emailLocal);
      continue;
    }
    if (await hasConsentInForce(http, patientId, options.now)) {
      alreadyActive.push(patient.emailLocal);
      continue;
    }
    const plan = planDemoConsent(patient, patientId, options.now);
    await http.put(plan.binary);
    await http.put(plan.consent);
    created.push(patient.emailLocal);
  }
  return { created, alreadyActive, withoutConsent: options.withoutConsent.map((patient) => patient.emailLocal), missing };
}
