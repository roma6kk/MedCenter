import { FhirHttp } from '../shared/fhir-http';
import { newPassword } from './checks-auth';
import { completionBody } from './checks-chain-encounter';
import { bookSlot, consentOf, postConsent, recordConsent, uploadScan } from './consent-api';
import { modeFromAnswer, reconcileMode, type EnforcementMode } from './consent-mode';
import { bodyObject, expectDefined, expectEqual, expectProblem, expectStatus, expectTrue } from './smoke-assert';
import { signIn } from './smoke-session';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject, Session } from './smoke-types';
import { runTag, type Suite } from './suite';

const GROUP = 'consent (ADR-019)';
const REASON = 'Жалобы на кашель (smoke)';
const EMERGENCY_REASON = 'Пациент без сознания, согласие дать не может (smoke)';
const BYPASS_SUBTYPE = 'urn:medcenter:audit-event-subtype|consent-emergency-bypass';
const FIRST_SLOT = 3;

/**
 * What the steps hand to each other. The patient is a throwaway one that smoke registers, so the demo
 * patients' consent (and the deliberate absence of it) is never touched.
 */
interface Run {
  readonly tag: string;
  readonly email: string;
  patient?: Session;
  patientId: string;
  mode: EnforcementMode;
  /** Appointment ids by scenario: `first` (consent given), `second` (consent revoked), `third` (emergency). */
  readonly appointment: { first: string; second: string; third: string };
  encounterId: string;
}

const session = (run: Run): Session => expectDefined(run.patient, 'the throwaway patient session');
const idOf = (response: { readonly body: unknown }): string => String((response.body as JsonObject)['id']);

function registerStep(suite: Suite, run: Run): SmokeStep {
  return {
    name: 'register and sign in a throwaway patient (accountConsent at registration, API 2.2.6)',
    run: async () => {
      const password = newPassword();
      const body = { email: run.email, password, firstName: 'Смоук', lastName: 'Согласие', birthDate: '1990-05-06', gender: 'male', accountConsent: { accepted: true, textVersion: '2026-10' } };
      expectStatus(await suite.api.post('/api/v1/auth/register', { body }), 201);
      run.patient = await signIn(suite.config, { role: 'PATIENT', email: run.email, password });
      run.patientId = expectDefined(run.patient.claims.patient, 'the patient claim of the new token');
    },
  };
}

/** API 6.1: a free-text reason without consent. This booking also tells which mode the stack runs. */
function reasonWithoutConsentStep(suite: Suite, run: Run, slotId: string): SmokeStep {
  return {
    name: '6.1 with a free-text reason and no consent: block -> 409 CONSENT_REQUIRED, warn -> booked without the reason',
    run: async () => {
      const response = await bookSlot(suite, session(run), slotId, REASON);
      run.mode = reconcileMode(suite.config.consentEnforcement, modeFromAnswer(response));
      if (run.mode === 'block') {
        return expectProblem(response, 409, 'CONSENT_REQUIRED');
      }
      expectStatus(response, 201);
      expectTrue(!JSON.stringify(response.body).includes(REASON), 'warn mode must drop the reason, not store it');
      expectStatus(await suite.api.post(`/api/v1/appointments/${idOf(response)}/cancel`, { session: session(run), body: { reason: 'Освобождаем слот (smoke)' } }), 200);
    },
  };
}

function bookStep(suite: Suite, run: Run, slotId: string, key: keyof Run['appointment'], label: string): SmokeStep {
  return {
    name: `book the ${label} appointment without a reason -> 201 (booking itself needs no consent)`,
    run: async () => {
      const response = await bookSlot(suite, session(run), slotId);
      expectStatus(response, 201);
      run.appointment[key] = idOf(response);
    },
  };
}

function openEncounter(suite: Suite, run: Run, key: keyof Run['appointment'], extra: JsonObject = {}): ReturnType<Suite['api']['post']> {
  return suite.api.post('/api/v1/encounters', { session: suite.sessions.doctor, body: { appointmentId: run.appointment[key], ...extra } });
}

/** `block` refuses before the write; `warn` lets the first open through (and the later ones replay it). */
function gatedOpenStep(suite: Suite, run: Run, key: keyof Run['appointment'], name: string): SmokeStep {
  return {
    name: `${name}: block -> 409 CONSENT_REQUIRED (nothing written), warn -> 201`,
    run: async () => {
      const response = await openEncounter(suite, run, key);
      if (run.mode === 'block') {
        return expectProblem(response, 409, 'CONSENT_REQUIRED');
      }
      expectStatus(response, 201);
    },
  };
}

function noConsentYetStep(suite: Suite, run: Run): SmokeStep {
  const { api, sessions } = suite;
  return {
    name: '3.4 (patient) and 3.7 (linked doctor, admin) show no consent; an unlinked doctor gets 403 COMPARTMENT_VIOLATION on 3.7',
    run: async () => {
      expectEqual(consentOf(await api.get('/api/v1/me/consent', { session: session(run) })).active, null, 'active consent of 3.4');
      for (const who of [sessions.doctor, sessions.admin]) {
        const seen = consentOf(await api.get(`/api/v1/patients/${run.patientId}/consent`, { session: who }));
        expectEqual(seen.active, null, `active consent of 3.7 as ${who.role}`);
      }
      expectProblem(await api.get(`/api/v1/patients/${run.patientId}/consent`, { session: sessions.otherDoctor }), 403, 'COMPARTMENT_VIOLATION');
    },
  };
}

function recordSteps(suite: Suite, run: Run): SmokeStep[] {
  let scanId = '';
  return [
    { name: '3.10 as ADMIN: upload the scan of the paper form -> 201 with its SHA-1', run: async () => void (scanId = await uploadScan(suite, run.patientId, run.tag)) },
    {
      name: '3.8 as ADMIN -> 201 active; a second 3.8 -> 409 CONSENT_ALREADY_ACTIVE',
      run: async () => {
        const created = await postConsent(suite, run.patientId, scanId, `SMOKE-${run.tag}`);
        expectStatus(created, 201);
        expectEqual(bodyObject(created)['status'], 'active', 'status');
        expectProblem(await postConsent(suite, run.patientId, scanId, `SMOKE-${run.tag}-2`), 409, 'CONSENT_ALREADY_ACTIVE');
      },
    },
    {
      name: '3.7 (doctor, admin), 3.4 (patient) -> the active consent; 3.11 -> the doctor downloads the same scan',
      run: async () => {
        for (const [path, who] of [[`/api/v1/patients/${run.patientId}/consent`, suite.sessions.doctor], [`/api/v1/patients/${run.patientId}/consent`, suite.sessions.admin], ['/api/v1/me/consent', session(run)]] as const) {
          expectEqual((consentOf(await suite.api.get(path, { session: who })).active ?? {})['status'], 'active', `active consent at ${path} as ${who.role}`);
        }
        const scan = await suite.api.get(`/api/v1/patients/${run.patientId}/consent/scan/${scanId}`, { session: suite.sessions.doctor });
        expectStatus(scan, 200);
        expectTrue(scan.contentType.includes('application/pdf') && scan.text.startsWith('%PDF-'), 'the downloaded scan is not the uploaded PDF');
      },
    },
  ];
}

/** With a consent in force 7.1 and 7.3 pass in both modes (`warn` has already opened it, so this is a replay). */
function withConsentSteps(suite: Suite, run: Run): SmokeStep[] {
  return [
    {
      name: '7.1 with the consent in force -> opened (201, or 200 when warn already opened it)',
      run: async () => {
        const response = await openEncounter(suite, run, 'first');
        expectStatus(response, run.mode === 'block' ? 201 : 200);
        run.encounterId = idOf(response);
      },
    },
    {
      name: '7.3 with the consent in force -> 200 finished',
      run: async () => {
        const response = await suite.api.post(`/api/v1/encounters/${run.encounterId}/complete`, { session: suite.sessions.doctor, body: completionBody() });
        expectStatus(response, 200);
        expectEqual(bodyObject(response)['status'], 'finished', 'status');
      },
    },
  ];
}

function revokeByPatientStep(suite: Suite, run: Run): SmokeStep {
  return {
    name: '3.6 as the patient -> 200 inactive; 3.4 shows no active consent and keeps the revoked one in the history',
    run: async () => {
      const revoked = await suite.api.post('/api/v1/me/consent/revoke', { session: session(run) });
      expectStatus(revoked, 200);
      expectEqual(bodyObject(revoked)['status'], 'inactive', 'status after 3.6');
      const mine = consentOf(await suite.api.get('/api/v1/me/consent', { session: session(run) }));
      expectEqual(mine.active, null, 'active consent after 3.6');
      expectTrue(mine.history.length >= 1, 'the revoked consent disappeared from the history');
    },
  };
}

/** HAPI as the host publishes it: no API exposes the bypass event, so the check reads it where it is stored. */
async function bypassEventsOf(suite: Suite, run: Run): Promise<readonly unknown[]> {
  const events = await new FhirHttp(suite.config.fhirBaseUrl).search('AuditEvent', { subtype: BYPASS_SUBTYPE, entity: `Patient/${run.patientId}` });
  return events.flatMap((event) => (event['purposeOfEvent'] as Array<{ text?: string }> | undefined) ?? []).map((purpose) => purpose.text);
}

function emergencySteps(suite: Suite, run: Run): SmokeStep[] {
  return [
    {
      name: '7.1 with emergencyReason and no consent -> 201 (both modes); the emergency-bypass AuditEvent carries the reason',
      run: async () => {
        const response = await openEncounter(suite, run, 'third', { emergencyReason: EMERGENCY_REASON });
        expectStatus(response, 201);
        run.encounterId = idOf(response);
        expectTrue((await bypassEventsOf(suite, run)).includes(EMERGENCY_REASON), 'no emergency-bypass AuditEvent with the reason was written');
      },
    },
    {
      name: '7.3 with emergencyReason and no consent -> 200 finished',
      run: async () => {
        const body = completionBody({ emergencyReason: EMERGENCY_REASON });
        const response = await suite.api.post(`/api/v1/encounters/${run.encounterId}/complete`, { session: suite.sessions.doctor, body });
        expectStatus(response, 200);
      },
    },
  ];
}

/** The revoked-consent appointment: `block` never opened it (cancel frees the slot); `warn` did (the doctor finishes it). */
function tidySecondStep(suite: Suite, run: Run): SmokeStep {
  return {
    name: 'tidy up the second appointment (block: the patient cancels it; warn: the doctor completes the encounter warn opened)',
    run: async () => {
      if (run.mode === 'block') {
        return expectStatus(await suite.api.post(`/api/v1/appointments/${run.appointment.second}/cancel`, { session: session(run), body: { reason: 'Уборка после smoke-проверки' } }), 200);
      }
      const opened = await openEncounter(suite, run, 'second');
      expectStatus(opened, 200);
      expectStatus(await suite.api.post(`/api/v1/encounters/${idOf(opened)}/complete`, { session: suite.sessions.doctor, body: completionBody() }), 200);
    },
  };
}

function revokeByStaffStep(suite: Suite, run: Run): SmokeStep {
  return {
    name: '3.8 again, then 3.9 as ADMIN with the application number -> 200 inactive with revocationNumber',
    run: async () => {
      await recordConsent(suite, run.patientId, `${run.tag}-again`);
      const revoked = await suite.api.post(`/api/v1/patients/${run.patientId}/consent/revoke`, { session: suite.sessions.admin, body: { applicationNumber: `SMOKE-APP-${run.tag}` } });
      expectStatus(revoked, 200);
      expectEqual(bodyObject(revoked)['status'], 'inactive', 'status after 3.9');
      expectEqual(bodyObject(revoked)['revocationNumber'], `SMOKE-APP-${run.tag}`, 'revocationNumber');
    },
  };
}

function stepsOf(suite: Suite, run: Run, slots: readonly JsonObject[]): SmokeStep[] {
  const slotId = (offset: number): string => String((slots[FIRST_SLOT + offset] as JsonObject)['id']);
  return [
    registerStep(suite, run),
    reasonWithoutConsentStep(suite, run, slotId(0)),
    bookStep(suite, run, slotId(0), 'first', 'first'),
    gatedOpenStep(suite, run, 'first', '7.1 without consent'),
    noConsentYetStep(suite, run),
    ...recordSteps(suite, run),
    ...withConsentSteps(suite, run),
    revokeByPatientStep(suite, run),
    bookStep(suite, run, slotId(1), 'second', 'second'),
    gatedOpenStep(suite, run, 'second', '3.6 revoked, then 7.1'),
    bookStep(suite, run, slotId(2), 'third', 'third'),
    ...emergencySteps(suite, run),
    tidySecondStep(suite, run),
    revokeByStaffStep(suite, run),
  ];
}

/**
 * The consent rules end to end (ADR-019, API 3.4-3.11, 6.1, 7.1, 7.3), on a throwaway patient. The steps
 * assert the mode the stack runs (`CONSENT_ENFORCEMENT`, detected by the first booking or named in
 * `SMOKE_CONSENT_ENFORCEMENT`): `block` refuses with 409 CONSENT_REQUIRED, `warn` lets the same calls through.
 * Needs 3 free slots after the first three that the other chains use.
 */
export async function consentChecks(suite: Suite, slots: readonly JsonObject[]): Promise<void> {
  const tag = runTag();
  const run: Run = { tag, email: `smoke.consent.${tag}@medcenter.test`, patientId: '', mode: 'block', appointment: { first: '', second: '', third: '' }, encounterId: '' };
  await suite.runner.chain(GROUP, stepsOf(suite, run, slots));
  await suite.runner.check(GROUP, 'the throwaway patient account is deactivated again (the run leaves no active test account)', async () => {
    const found = await suite.api.get('/api/v1/admin/users', { session: suite.sessions.admin, query: { search: run.email, pageSize: 5 } });
    const user = ((bodyObject(found)['items'] as JsonObject[] | undefined) ?? []).find((item) => item['email'] === run.email);
    if (user !== undefined) {
      expectStatus(await suite.api.delete(`/api/v1/admin/users/${String(user['id'])}`, { session: suite.sessions.admin }), 200);
    }
  });
}
