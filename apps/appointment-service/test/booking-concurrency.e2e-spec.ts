import { createPublicKey, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv, E2E_ISSUER } from './e2e-env';

const HAPI_PORT = 8080;
const HAPI_STARTUP_MS = 240_000;
const KEY_ID = 'e2e-1';

/** Base64url without padding, as JWS requires. */
const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/** Serves the public half of `keys` as a JWKS, so `JwtAuthGuard` verifies tokens the test signs. */
function startJwksServer(publicJwk: Record<string, unknown>): Promise<{ server: Server; url: string }> {
  const body = JSON.stringify({ keys: [{ ...publicJwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }] });
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/.well-known/jwks.json` });
    });
  });
}

/** Patient-role access token, signed with the key the JWKS server publishes. */
function patientToken(privateKey: string, patientRef: string): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }));
  const payload = base64url(
    JSON.stringify({
      iss: E2E_ISSUER,
      sub: `user-${randomUUID()}`,
      jti: randomUUID(),
      role: 'PATIENT',
      scope: 'patient/*.read patient/*.write',
      patient: patientRef,
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

/**
 * Seeds one free slot (with the Patient, PractitionerRole, HealthcareService and
 * Schedule it references, since HAPI enforces referential integrity on write).
 */
async function seedFreeSlot(fhirBase: string): Promise<{ patientRef: string; slotId: string }> {
  const put = async (resource: Record<string, unknown>): Promise<void> => {
    const response = await fetch(`${fhirBase}/${resource['resourceType']}/${resource['id']}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(resource),
    });
    if (!response.ok) {
      throw new Error(`seed ${String(resource['resourceType'])} failed: ${response.status} ${await response.text()}`);
    }
  };

  const patientId = randomUUID();
  const roleId = randomUUID();
  const serviceId = randomUUID();
  const scheduleId = randomUUID();
  const slotId = randomUUID();

  await put({ resourceType: 'Patient', id: patientId, active: true });
  await put({ resourceType: 'PractitionerRole', id: roleId, active: true });
  await put({ resourceType: 'HealthcareService', id: serviceId, active: true });
  await put({
    resourceType: 'Schedule',
    id: scheduleId,
    active: true,
    actor: [
      { reference: `PractitionerRole/${roleId}` },
      { reference: `HealthcareService/${serviceId}` },
    ],
  });
  await put({
    resourceType: 'Slot',
    id: slotId,
    status: 'free',
    start: '2026-11-02T09:00:00+03:00',
    end: '2026-11-02T09:30:00+03:00',
    schedule: { reference: `Schedule/${scheduleId}` },
  });
  return { patientRef: `Patient/${patientId}`, slotId };
}

/**
 * Booking race (BR-001, M3 gate): two patients book the same free slot at the
 * same time. The Slot `ifMatch` in the transaction Bundle lets exactly one win.
 *
 * Runs against a real HAPI FHIR server started by Testcontainers, so the
 * optimistic lock is exercised by HAPI itself, not by a mock. Needs Docker.
 */
describe('Booking concurrency (e2e, HAPI-backed)', () => {
  let app: INestApplication;
  let hapi: StartedTestContainer | undefined;
  let jwks: Server | undefined;
  let fhirBase: string;
  let privateKey: string;

  beforeAll(async () => {
    hapi = await new GenericContainer('hapiproject/hapi:latest')
      .withExposedPorts(HAPI_PORT)
      .withWaitStrategy(Wait.forHttp('/fhir/metadata', HAPI_PORT).forStatusCode(200).withStartupTimeout(HAPI_STARTUP_MS))
      .start();
    fhirBase = `http://${hapi.getHost()}:${hapi.getMappedPort(HAPI_PORT)}/fhir`;

    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = keys.privateKey;
    const { server, url } = await startJwksServer(createPublicKey(keys.publicKey).export({ format: 'jwk' }));
    jwks = server;

    applyE2eEnv();
    process.env['FHIR_BASE_URL'] = fhirBase;
    process.env['JWT_JWKS_URI'] = url;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, HAPI_STARTUP_MS + 60_000);

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => {
      if (jwks === undefined) {
        resolve();
        return;
      }
      jwks.close(() => resolve());
    });
    await hapi?.stop();
  });

  it('lets exactly one of two concurrent bookings of one slot succeed (201) and rejects the other (409 SLOT_CONFLICT)', async () => {
    const { patientRef, slotId } = await seedFreeSlot(fhirBase);
    const token = patientToken(privateKey, patientRef);
    const book = () =>
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ slotId });

    const responses = await Promise.all([book(), book()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect(loser?.body).toMatchObject({ errorCode: 'SLOT_CONFLICT' });

    const slot = (await (await fetch(`${fhirBase}/Slot/${slotId}`)).json()) as { status: string };
    expect(slot.status).toBe('busy');
    const appointments = (await (await fetch(`${fhirBase}/Appointment?slot=Slot/${slotId}`)).json()) as {
      entry?: unknown[];
    };
    expect(appointments.entry ?? []).toHaveLength(1);
  }, 60_000);
});
