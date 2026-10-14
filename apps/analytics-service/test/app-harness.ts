import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { AppModule } from '../src/app/app.module';
import { ANALYTICS_DATA_SOURCE } from '../src/database/database.tokens';
import { AUDIT_REPOSITORY } from '../src/modules/audit/audit.repository';
import { REPORTS_REPOSITORY, type ReportsRepository } from '../src/modules/reports/reports.repository';
import { READ_MODEL_WRITER, type ReadModelWriter } from '../src/modules/worker/read-model.writer';
import { applyE2eEnv } from './e2e-env';
import { InMemoryAuditRepository } from './in-memory-audit.repository';
import { startTestIssuer, type TestIssuer } from './test-tokens';

/** HAPI stand-in: every FHIR call the service makes is observable and scriptable. */
export type FakeFhir = jest.Mocked<FhirClient>;

export interface AppHarness {
  readonly app: INestApplication;
  readonly fhir: FakeFhir;
  readonly issuer: TestIssuer;
  readonly audit: InMemoryAuditRepository;
  readonly reports: jest.Mocked<ReportsRepository>;
  get<T>(token: Type<T>): T;
  adminToken(): string;
  close(): Promise<void>;
}

function createFakeFhir(): FakeFhir {
  return {
    search: jest.fn().mockResolvedValue({ entry: [] }),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as FakeFhir;
}

function createReportsRepository(): jest.Mocked<ReportsRepository> {
  return {
    countAppointmentsByStatus: jest.fn().mockResolvedValue([]),
    countEncountersBySpecialty: jest.fn().mockResolvedValue([]),
    countBookingsByService: jest.fn().mockResolvedValue([]),
  };
}

const UNUSED_WRITER: ReadModelWriter = {
  isProcessed: () => Promise.reject(new Error('the worker is disabled in e2e')),
  applyBooked: () => Promise.reject(new Error('the worker is disabled in e2e')),
  applyCancelled: () => Promise.reject(new Error('the worker is disabled in e2e')),
  applyEncounterCompleted: () => Promise.reject(new Error('the worker is disabled in e2e')),
};

/**
 * Boots the real `AppModule` — global guard stack, validation pipe, RFC 7807
 * filter — over a fake FHIR client and in-memory read-model repositories, so
 * HTTP behaviour is tested without HAPI, PostgreSQL, Redis or RabbitMQ.
 */
export async function startAppHarness(extraControllers: ReadonlyArray<Type<unknown>> = []): Promise<AppHarness> {
  applyE2eEnv();
  const issuer = await startTestIssuer();
  process.env['JWT_JWKS_URI'] = issuer.jwksUri;
  const fhir = createFakeFhir();
  const audit = new InMemoryAuditRepository();
  const reports = createReportsRepository();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [...extraControllers] })
    .overrideProvider(ANALYTICS_DATA_SOURCE)
    .useValue({ isInitialized: false })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .overrideProvider(AUDIT_REPOSITORY)
    .useValue(audit)
    .overrideProvider(REPORTS_REPOSITORY)
    .useValue(reports)
    .overrideProvider(READ_MODEL_WRITER)
    .useValue(UNUSED_WRITER)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  return {
    app,
    fhir,
    issuer,
    audit,
    reports,
    get: <T>(token: Type<T>): T => moduleRef.get(token, { strict: false }),
    adminToken: () => issuer.sign({ sub: 'admin-1', role: 'ADMIN', scope: 'user/*.read user/*.write launch' }),
    close: async () => {
      await app.close();
      await issuer.close();
    },
  };
}
