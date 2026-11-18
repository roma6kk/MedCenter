import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { AppModule } from '../src/app/app.module';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { bearer, DOCTOR_SCOPE, PATIENT_SCOPE } from '@medcenter/testing';

export const TOKENS = {
  admin: bearer({ role: 'ADMIN', scope: DOCTOR_SCOPE }),
  doctor: bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE, fhirUser: 'PractitionerRole/role-7' }),
  patient: bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'pat-1', fhirUser: 'Patient/pat-1' }),
} as const;

export interface CatalogHarness {
  readonly app: INestApplication;
  readonly fhir: jest.Mocked<FhirClient>;
  readonly store: InMemoryCacheStore;
}

export function createFhirStub(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue({ entry: [] }),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as jest.Mocked<FhirClient>;
}

export async function bootCatalog(): Promise<CatalogHarness> {
  applyE2eEnv();
  const fhir = createFhirStub();
  const store = new InMemoryCacheStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .overrideProvider(CACHE_STORE)
    .useValue(store)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return { app, fhir, store };
}
