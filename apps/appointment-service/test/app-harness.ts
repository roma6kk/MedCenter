import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe, IDEMPOTENCY_STORE, type IdempotencyStore } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { EVENT_PUBLISHER } from '@medcenter/messaging';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from './test-tokens';

/** HAPI stand-in: every FHIR call the service makes is observable and scriptable. */
export type FakeFhir = jest.Mocked<FhirClient>;

export interface AppHarness {
  readonly app: INestApplication;
  readonly fhir: FakeFhir;
  readonly issuer: TestIssuer;
  close(): Promise<void>;
}

function createFakeFhir(): FakeFhir {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as FakeFhir;
}

function createMemoryStore(): IdempotencyStore {
  const entries = new Map<string, string>();
  return {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
    },
  };
}

/**
 * Boots the real `AppModule` — global guard stack, validation pipe, RFC 7807
 * filter — over a fake FHIR client, an in-memory idempotency store and a no-op
 * event publisher, so HTTP behaviour is tested without HAPI, Redis or RabbitMQ.
 */
export async function startAppHarness(): Promise<AppHarness> {
  applyE2eEnv();
  const issuer = await startTestIssuer();
  process.env['JWT_JWKS_URI'] = issuer.jwksUri;
  const fhir = createFakeFhir();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .overrideProvider(IDEMPOTENCY_STORE)
    .useValue(createMemoryStore())
    .overrideProvider(EVENT_PUBLISHER)
    .useValue({ publish: jest.fn().mockResolvedValue(undefined) })
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  return {
    app,
    fhir,
    issuer,
    close: async () => {
      await app.close();
      await issuer.close();
    },
  };
}

/** A booked appointment of `Patient/pat-1` with `PractitionerRole/role-1`. */
export const BOOKED_APPOINTMENT: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  created: '2026-10-13',
  slot: [{ reference: 'Slot/slot-1' }],
  participant: [
    { actor: { reference: 'Patient/pat-1' }, status: 'accepted' },
    { actor: { reference: 'PractitionerRole/role-1' }, status: 'accepted' },
    { actor: { reference: 'HealthcareService/svc-1' }, status: 'accepted' },
  ],
  meta: { versionId: '2' },
};

/** Search Bundle for {@link BOOKED_APPOINTMENT} with the resources `_include` brings in. */
export function bookedSearchBundle(): { total: number; entry: Array<{ resource: FhirResource; search: { mode: string } }> } {
  return {
    total: 1,
    entry: [
      { resource: BOOKED_APPOINTMENT, search: { mode: 'match' } },
      { resource: { resourceType: 'PractitionerRole', id: 'role-1', practitioner: { reference: 'Practitioner/doc-7' } }, search: { mode: 'include' } },
      { resource: { resourceType: 'Practitioner', id: 'doc-7', name: [{ family: 'Петров', given: ['Иван'] }] }, search: { mode: 'include' } },
      { resource: { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' }, search: { mode: 'include' } },
      { resource: { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Иванова', given: ['Анна'] }] }, search: { mode: 'include' } },
    ],
  };
}
