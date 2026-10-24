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
  /** Replaces the `auth`-schema identity lookup (token suites that mint codes for synthetic users). */
  readonly identities?: IdentityResolver;
  /** Spec-only probe controllers mounted next to the application's own. */
  readonly controllers?: ReadonlyArray<Type<unknown>>;
  /** Express `trust proxy`, as `main.ts` sets it from `TRUST_PROXY`. */
  readonly trustProxy?: boolean | number;
  /** Use the real `auth` DataSource (configured through `AUTH_DB_*`) instead of the in-memory store. */
  readonly realDatabase?: boolean;
}

export interface AuthApp {
  readonly app: INestApplication;
  readonly moduleRef: TestingModule;
  readonly fakes: InfrastructureFakes;
}

/**
 * Boots the real `AppModule` — guard stack, validation pipe, RFC 7807 filter,
 * OAuth, users and terminology modules — over an in-memory `auth` store, a fake
 * HAPI, so HTTP behaviour is tested without PostgreSQL or HAPI (`realDatabase`
 * swaps in PostgreSQL only).
 */
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
  // The same factory `main.ts` mounts, so the pipeline under test is the one that ships.
  app.useGlobalPipes(createValidationPipe());
  if (options.trustProxy !== undefined) {
    app.getHttpAdapter().getInstance().set('trust proxy', options.trustProxy);
  }
  await app.init();
  return { app, moduleRef, fakes };
}

/** `Set-Cookie` headers of a supertest response, as `name=value` pairs ready for a `Cookie` header. */
export function cookiesOf(setCookie: unknown): ReadonlyArray<string> {
  const headers = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  return headers
    .filter((header): header is string => typeof header === 'string')
    .map((header) => header.split(';')[0] ?? '')
    .filter((pair) => pair.length > 0 && !pair.endsWith('='));
}
