import { createHash, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { createValidationPipe } from '@medcenter/common';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer, type TestTokenClaims } from './test-tokens';

const HAPI_PORT = 8080;
/** HAPI (Spring Boot) can need minutes on a loaded machine; `E2E_HAPI_STARTUP_MS` extends the budget. */
const HAPI_STARTUP_MS = Number(process.env['E2E_HAPI_STARTUP_MS'] ?? 240_000);

interface SeededSlot {
  readonly patientId: string;
  readonly roleId: string;
  readonly slotId: string;
}

async function put(fhirBase: string, resource: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${fhirBase}/${String(resource['resourceType'])}/${String(resource['id'])}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(resource),
  });
  if (!response.ok) {
    throw new Error(`seed ${String(resource['resourceType'])} failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Seeds one free slot with everything it references (HAPI enforces referential
 * integrity on write) and the names the read side resolves through `_include`.
 */
async function seedFreeSlot(fhirBase: string, start: string, end: string): Promise<SeededSlot> {
  const [patientId, practitionerId, roleId, serviceId, scheduleId] = [1, 2, 3, 4, 5].map(() => randomUUID());
  // Same id shape catalog-service generates (64 hex chars of SHA-256), not a UUID.
  const slotId = createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);

  await put(fhirBase, { resourceType: 'Patient', id: patientId, active: true, name: [{ family: 'Иванова', given: ['Анна'] }] });
  await put(fhirBase, { resourceType: 'Practitioner', id: practitionerId, active: true, name: [{ family: 'Петров', given: ['Иван'] }] });
  await put(fhirBase, { resourceType: 'PractitionerRole', id: roleId, active: true, practitioner: { reference: `Practitioner/${practitionerId}` } });
  await put(fhirBase, { resourceType: 'HealthcareService', id: serviceId, active: true, name: 'Консультация терапевта' });
  await put(fhirBase, {
    resourceType: 'Schedule',
    id: scheduleId,
    active: true,
    actor: [{ reference: `PractitionerRole/${roleId}` }, { reference: `HealthcareService/${serviceId}` }],
  });
  await put(fhirBase, { resourceType: 'Slot', id: slotId, status: 'free', start, end, schedule: { reference: `Schedule/${scheduleId}` } });
  return { patientId, roleId, slotId };
}

/**
 * Booking against a real HAPI FHIR server started by Testcontainers (needs
 * Docker): the optimistic lock (BR-001, M3 gate) is exercised by HAPI itself,
 * and so are the read-side search parameters (API §6.2/6.3/6.5).
 */
describe('Booking concurrency (e2e, HAPI-backed)', () => {
  let app: INestApplication;
  let hapi: StartedTestContainer | undefined;
  let issuer: TestIssuer | undefined;
  let fhirBase: string;

  const bearer = (claims: TestTokenClaims): string => `Bearer ${issuer?.sign(claims) ?? ''}`;
  const patientOf = (patientId: string): TestTokenClaims => ({
    sub: `user-${randomUUID()}`,
    role: 'PATIENT',
    scope: 'patient/*.read patient/*.write',
    // auth-service issues the SMART `patient` claim as a bare Patient id.
    patient: patientId,
  });

  beforeAll(async () => {
    hapi = await new GenericContainer('hapiproject/hapi:latest')
      .withExposedPorts(HAPI_PORT)
      .withWaitStrategy(Wait.forHttp('/fhir/metadata', HAPI_PORT).forStatusCode(200).withStartupTimeout(HAPI_STARTUP_MS))
      .start();
    fhirBase = `http://${hapi.getHost()}:${hapi.getMappedPort(HAPI_PORT)}/fhir`;

    issuer = await startTestIssuer();
    applyE2eEnv();
    process.env['FHIR_BASE_URL'] = fhirBase;
    process.env['JWT_JWKS_URI'] = issuer.jwksUri;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  }, HAPI_STARTUP_MS + 60_000);

  // Stopping the HAPI container can outlast Jest's 5 s default hook budget.
  afterAll(async () => {
    await app?.close();
    await issuer?.close();
    await hapi?.stop();
  }, 120_000);

  it('should let exactly one booking succeed (201) and reject the other (409 SLOT_CONFLICT) when two race for one slot', async () => {
    const { patientId, slotId } = await seedFreeSlot(fhirBase, '2026-11-02T09:00:00+03:00', '2026-11-02T09:30:00+03:00');
    const token = bearer(patientOf(patientId));
    const book = () => request(app.getHttpServer()).post('/api/v1/appointments').set('Authorization', token).send({ slotId });

    const responses = await Promise.all([book(), book()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect(loser?.body).toMatchObject({ errorCode: 'SLOT_CONFLICT' });
    const slot = (await (await fetch(`${fhirBase}/Slot/${slotId}`)).json()) as { status: string };
    expect(slot.status).toBe('busy');
    const appointments = (await (await fetch(`${fhirBase}/Appointment?slot=Slot/${slotId}`)).json()) as { entry?: unknown[] };
    expect(appointments.entry ?? []).toHaveLength(1);
  }, 60_000);

  it('should serve the booked appointment, with names, to its patient and participant doctor when HAPI holds it', async () => {
    const { patientId, roleId, slotId } = await seedFreeSlot(fhirBase, '2030-11-04T09:00:00+03:00', '2030-11-04T09:30:00+03:00');
    const patient = bearer(patientOf(patientId));
    const doctor: TestTokenClaims = { sub: 'doc-1', role: 'DOCTOR', scope: 'user/*.read', fhirUser: `PractitionerRole/${roleId}` };
    const server = app.getHttpServer();
    const booked = await request(server).post('/api/v1/appointments').set('Authorization', patient).send({ slotId }).expect(201);
    const names = { doctorName: 'Петров Иван', serviceName: 'Консультация терапевта', patientName: 'Иванова Анна' };

    const own = await request(server).get('/api/v1/appointments?upcoming=true&page=1&pageSize=5').set('Authorization', patient).expect(200);
    const detail = await request(server).get(`/api/v1/appointments/${String(booked.body.id)}`).set('Authorization', bearer(doctor)).expect(200);
    const journal = await request(server)
      .get('/api/v1/doctor/appointments?from=2030-11-04&to=2030-11-04')
      .set('Authorization', bearer(doctor))
      .expect(200);
    const foreign = await request(server)
      .get(`/api/v1/appointments/${String(booked.body.id)}`)
      .set('Authorization', bearer({ ...doctor, fhirUser: `PractitionerRole/${randomUUID()}` }))
      .expect(403);

    expect(own.body.meta).toEqual({ page: 1, pageSize: 5, totalItems: 1, totalPages: 1 });
    expect(own.body.items[0]).toMatchObject({ id: booked.body.id, ...names });
    expect(detail.body).toMatchObject({ id: booked.body.id, ...names });
    expect(journal.body.items.map((item: { id: string }) => item.id)).toEqual([booked.body.id]);
    expect(foreign.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  }, 60_000);
});
