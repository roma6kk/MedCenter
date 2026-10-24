import type { TestingModuleBuilder } from '@nestjs/testing';
import { FHIR_CLIENT } from '@medcenter/fhir';

import { AUTH_DATA_SOURCE } from '../database/database.providers';
import { LOGIN_ATTEMPT_STORE, InMemoryLoginAttemptStore } from '../modules/oauth/login/login-attempt-store';
import { IMPORT_LOCK, InMemoryImportLock } from '../modules/terminology/import/import-lock';
import { TERMINOLOGY_CACHE, InMemoryTerminologyCache } from '../modules/terminology/terminology-cache';
import { USER_STORE } from '../modules/users/store/user-store';
import { InMemoryUserStore } from '../modules/users/__tests__/in-memory-user.store';
import { createFakeFhir, type FakeFhir } from '../modules/users/__tests__/users-harness';

/** Stand-ins for everything outside the process: PostgreSQL and HAPI. */
export interface InfrastructureFakes {
  readonly store: InMemoryUserStore;
  readonly fhir: FakeFhir;
  /** The per-account login counter (Redis in production). */
  readonly loginAttempts: InMemoryLoginAttemptStore;
}

export function createInfrastructureFakes(): InfrastructureFakes {
  return {
    store: new InMemoryUserStore(),
    fhir: createFakeFhir(),
    loginAttempts: new InMemoryLoginAttemptStore(),
  };
}

export interface FakeOptions {
  /** Keep the real `auth` DataSource and `TypeOrmUserStore` (a suite that supplies a PostgreSQL). */
  readonly realDatabase?: boolean;
}

/**
 * Swaps the infrastructure providers of `AppModule`/`OAuthModule` for fakes:
 * the eager `auth` DataSource (which would connect and migrate) becomes an
 * uninitialised stub, so the real controllers, guards and services run
 * against in-memory state. HAPI and the terminology cache are always
 * faked; PostgreSQL only unless `realDatabase` is set.
 */
export function withInfrastructureFakes(
  builder: TestingModuleBuilder,
  fakes: InfrastructureFakes = createInfrastructureFakes(),
  options: FakeOptions = {},
): TestingModuleBuilder {
  const faked = builder
    .overrideProvider(FHIR_CLIENT)
    .useValue(fakes.fhir)
    // Never reach for a developer's Redis: the cache is per-suite and in-process.
    .overrideProvider(TERMINOLOGY_CACHE)
    .useValue(new InMemoryTerminologyCache())
    .overrideProvider(IMPORT_LOCK)
    .useValue(new InMemoryImportLock())
    .overrideProvider(LOGIN_ATTEMPT_STORE)
    .useValue(fakes.loginAttempts);
  if (options.realDatabase === true) {
    return faked;
  }
  return faked
    .overrideProvider(AUTH_DATA_SOURCE)
    .useValue({ isInitialized: false })
    .overrideProvider(USER_STORE)
    .useValue(fakes.store);
}
