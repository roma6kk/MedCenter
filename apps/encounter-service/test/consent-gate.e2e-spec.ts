import type { FhirResource } from '@medcenter/fhir';
import request from 'supertest';

import {
  activeConsent,
  APPOINTMENT_ID,
  bookedAppointment,
  completeBody,
  DOCTOR,
  healthcareService,
  startAppHarness,
  type AppHarness,
} from './app-harness';
import type { ConsentEnforcement } from '../src/common/consent/consent-gate';

function inProgress(): FhirResource {
  return {
    resourceType: 'Encounter',
    id: 'enc-1',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: 'Patient/pat-1' },
    participant: [{ individual: { reference: 'PractitionerRole/role-1' } }],
    appointment: [{ reference: `Appointment/${APPOINTMENT_ID}` }],
    period: { start: '2026-11-02T09:00:00+03:00' },
  };
}

const REASON = 'Пациент без сознания, представителя нет';

/** API §7.1/7.3 with the patient-consent rule of ADR-019 (`CONSENT_ENFORCEMENT`). */
describe('Consent gate on 7.1 / 7.3', () => {
  let harness: AppHarness;

  async function start(mode: ConsentEnforcement, ...extra: FhirResource[]): Promise<void> {
    harness = await startAppHarness(mode);
    harness.hapi.seed(bookedAppointment(), healthcareService(), ...extra);
  }

  afterEach(async () => {
    await harness.close();
  });

  function open(body: object = { appointmentId: APPOINTMENT_ID }): request.Test {
    return request(harness.app.getHttpServer())
      .post('/api/v1/encounters')
      .set('Authorization', `Bearer ${harness.issuer.sign(DOCTOR)}`)
      .send(body);
  }

  function complete(encounterId: string, body: object = completeBody()): request.Test {
    return request(harness.app.getHttpServer())
      .post(`/api/v1/encounters/${encounterId}/complete`)
      .set('Authorization', `Bearer ${harness.issuer.sign(DOCTOR)}`)
      .send(body);
  }

  const bypassAudits = (): unknown[] =>
    harness.hapi.stored('AuditEvent').filter((audit) => JSON.stringify(audit['subtype']).includes('consent-emergency-bypass'));

  describe('block mode', () => {
    it('should answer 409 CONSENT_REQUIRED and write nothing when opening without a consent', async () => {
      await start('block');

      const response = await open().expect(409);

      expect(response.body).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
      expect(harness.hapi.stored('Encounter')).toHaveLength(0);
      expect(harness.hapi.transactions).toHaveLength(0);
    });

    it('should open the encounter when an active consent exists', async () => {
      await start('block', activeConsent());

      await open().expect(201);

      expect(harness.hapi.stored('Encounter')).toHaveLength(1);
      expect(bypassAudits()).toHaveLength(0);
    });

    it('should treat a consent whose period has ended as missing', async () => {
      await start('block', activeConsent({ end: '2026-01-01' }));

      await open().expect(409);
    });

    it('should open with an emergency reason, journalling the bypass in the same transaction', async () => {
      await start('block');

      await open({ appointmentId: APPOINTMENT_ID, emergencyReason: `  ${REASON}  ` }).expect(201);

      const [audit] = bypassAudits() as Array<Record<string, unknown>>;
      expect(JSON.stringify(audit)).toContain(REASON);
      expect(JSON.stringify(audit?.['entity'])).toContain(harness.hapi.stored('Encounter')[0]?.id);
      expect(harness.hapi.transactions).toHaveLength(1);
    });

    it('should reject an emergency reason that is too short', async () => {
      await start('block');

      const response = await open({ appointmentId: APPOINTMENT_ID, emergencyReason: 'short' }).expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    });

  });

  describe('block mode, completion', () => {
    it('should answer 409 CONSENT_REQUIRED before terminology validation and write nothing', async () => {
      await start('block', inProgress());

      const response = await complete('enc-1', completeBody('X99')).expect(409);

      expect(response.body).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
      expect(harness.hapi.transactions).toHaveLength(0);
    });

    it('should complete when an active consent exists', async () => {
      await start('block', inProgress(), activeConsent());

      await complete('enc-1').expect(200);
    });

    it('should complete with an emergency reason and journal the bypass in the completion transaction', async () => {
      await start('block', inProgress());

      await complete('enc-1', { ...completeBody(), emergencyReason: REASON }).expect(200);

      expect(bypassAudits()).toHaveLength(1);
      expect(harness.hapi.transactions).toHaveLength(1);
      expect(JSON.stringify(bypassAudits()[0])).toContain('Encounter/enc-1');
    });
  });

  describe('warn mode', () => {
    it('should open and complete without a consent', async () => {
      await start('warn');

      const opened = await open().expect(201);
      await complete(String(opened.body.id)).expect(200);

      expect(bypassAudits()).toHaveLength(0);
    });
  });
});
