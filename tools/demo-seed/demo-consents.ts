import { createHash } from 'node:crypto';

import { buildConsent, isConsentInForce } from '@medcenter/fhir';

import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { seedResourceId } from '../shared/deterministic-id';
import { DOCTORS, type PatientDef } from './demo-catalog';
import { demoIds } from './demo-ids';

export const DEFAULT_PATIENT_WITHOUT_CONSENT = 'patient.novikov';

const SIGNER_DOCTOR_KEY = 'ivanova';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMAL_PDF_LIMIT = 4096;

export function consentKeyOf(patient: Pick<PatientDef, 'emailLocal'>): string {
  return patient.emailLocal.replace(/^patient\./, '');
}

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

export function scanHash(bytes: Buffer): string {
  return createHash('sha1').update(bytes).digest('base64');
}

interface PlannedDemoConsent {
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

// Dated the day before: a date-only period.start is read as UTC midnight, so "today" could lie ahead.
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

interface ConsentSelection {
  readonly withConsent: readonly PatientDef[];
  readonly withoutConsent: readonly PatientDef[];
}

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

interface DemoConsentsSummary {
  readonly created: readonly string[];
  readonly alreadyActive: readonly string[];
  readonly withoutConsent: readonly string[];
  readonly missing: readonly string[];
}

interface DemoConsentsOptions extends ConsentSelection {
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
