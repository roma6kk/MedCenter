import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from './test-issuer';

export interface BootedApp {
  readonly app: INestApplication;
  readonly fhir: jest.Mocked<FhirClient>;
  readonly issuer: TestIssuer;
  close(): Promise<void>;
}

export function createFhirMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

/**
 * Boots the real `AppModule` — guard stack, validation pipe, problem+json
 * filter — with HAPI replaced by a Jest mock behind `FHIR_CLIENT` and a local
 * issuer whose JWKS the JWT guard trusts.
 */
export async function bootApp(): Promise<BootedApp> {
  const issuer = await startTestIssuer();
  applyE2eEnv();
  process.env['JWT_JWKS_URI'] = issuer.jwksUri;

  const fhir = createFhirMock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
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
