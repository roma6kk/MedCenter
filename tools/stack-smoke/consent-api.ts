import { demoScanPdf, scanHash } from '../demo-seed/demo-consents';
import { asArray, bodyObject, expectDefined, expectEqual, expectStatus, expectTrue } from './smoke-assert';
import type { ApiResponse, JsonObject, Session } from './smoke-types';
import { newKey, type Suite } from './suite';

const CLERK_NAME = 'Смоук Регистратор';

function scanBytes(tag: string): Buffer {
  return demoScanPdf(`smoke-${tag}`);
}

export async function uploadScan(suite: Suite, patientId: string, tag: string, session: Session = suite.sessions.admin): Promise<string> {
  const bytes = scanBytes(tag);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `consent-${tag}.pdf`);
  const response = await suite.api.post(`/api/v1/patients/${patientId}/consent/scan`, { session, multipart: form });
  expectStatus(response, 201);
  const body = bodyObject(response);
  expectEqual(body['hash'], scanHash(bytes), 'scan hash (base64 SHA-1 of the uploaded bytes)');
  expectEqual(body['contentType'], 'application/pdf', 'scan contentType');
  return String(body['scanId']);
}

export function postConsent(suite: Suite, patientId: string, scanId: string, formNumber: string, session: Session = suite.sessions.admin): Promise<ApiResponse> {
  const body = { formNumber, signedAt: new Date().toISOString().slice(0, 10), scanId, consenterType: 'self', signedByName: CLERK_NAME };
  return suite.api.post(`/api/v1/patients/${patientId}/consent`, { session, body });
}

export async function recordConsent(suite: Suite, patientId: string, tag: string): Promise<string> {
  const scanId = await uploadScan(suite, patientId, tag);
  const response = await postConsent(suite, patientId, scanId, `SMOKE-${tag}`);
  expectStatus(response, 201);
  expectEqual(bodyObject(response)['status'], 'active', 'status of the recorded consent');
  return String(bodyObject(response)['id']);
}

export function consentOf(response: ApiResponse): { readonly active: JsonObject | null; readonly history: readonly unknown[] } {
  expectStatus(response, 200);
  const body = bodyObject(response);
  const active = body['active'];
  expectTrue(active === null || (typeof active === 'object' && active !== null), 'active must be an object or null');
  return { active: active as JsonObject | null, history: asArray(body['history'], 'history') };
}

export function bookSlot(suite: Suite, session: Session, slotId: string): Promise<ApiResponse> {
  return suite.api.post('/api/v1/appointments', { session, body: { slotId }, headers: { 'Idempotency-Key': newKey() } });
}

export async function ensureConsent(suite: Suite, patient: Session): Promise<void> {
  const mine = consentOf(await suite.api.get('/api/v1/me/consent', { session: patient }));
  if (mine.active === null) {
    await recordConsent(suite, expectDefined(patient.claims.patient, 'the patient claim'), 'chain');
  }
}
