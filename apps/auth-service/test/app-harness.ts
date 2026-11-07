import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';

import { AppModule } from '../src/app/app.module';
import {
  createInfrastructureFakes,
  withInfrastructureFakes,
  type InfrastructureFakes,
} from '../src/__tests__/infrastructure-fakes';
import { IDENTITY_RESOLVER, type IdentityResolver } from '../src/modules/oauth/identity';
import { applyE2eEnv } from './e2e-env';

export interface AuthAppOptions {
  readonly identities?: IdentityResolver;
  readonly controllers?: ReadonlyArray<Type<unknown>>;
  readonly trustProxy?: boolean | number;
  readonly realDatabase?: boolean;
}

export interface AuthApp {
  readonly app: INestApplication;
  readonly moduleRef: TestingModule;
  readonly fakes: InfrastructureFakes;
}

export async function startAuthApp(options: AuthAppOptions = {}): Promise<AuthApp> {
  applyE2eEnv();
  const fakes = createInfrastructureFakes();
  let builder = withInfrastructureFakes(
    Test.createTestingModule({ imports: [AppModule], controllers: [...(options.controllers ?? [])] }),
    fakes,
    { realDatabase: options.realDatabase === true },
  );
  if (options.identities !== undefined) {
    builder = builder.overrideProvider(IDENTITY_RESOLVER).useValue(options.identities);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  if (options.trustProxy !== undefined) {
    app.getHttpAdapter().getInstance().set('trust proxy', options.trustProxy);
  }
  await app.init();
  return { app, moduleRef, fakes };
}

export function cookiesOf(setCookie: unknown): ReadonlyArray<string> {
  const headers = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  return headers
    .filter((header): header is string => typeof header === 'string')
    .map((header) => header.split(';')[0] ?? '')
    .filter((pair) => pair.length > 0 && !pair.endsWith('='));
}
