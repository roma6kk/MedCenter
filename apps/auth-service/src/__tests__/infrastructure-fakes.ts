import type { TestingModuleBuilder } from '@nestjs/testing';
import { FHIR_CLIENT } from '@medcenter/fhir';

import { AUTH_DATA_SOURCE } from '../database/database.providers';
import { CLINIC_STORE } from '../modules/clinic/clinic.store';
import { InMemoryClinicStore } from '../modules/clinic/__tests__/in-memory-clinic.store';
import { LOGIN_ATTEMPT_STORE, InMemoryLoginAttemptStore } from '../modules/oauth/login/login-attempt-store';
import { IMPORT_LOCK, InMemoryImportLock } from '../modules/terminology/import/import-lock';
import { TERMINOLOGY_CACHE, InMemoryTerminologyCache } from '../modules/terminology/terminology-cache';
import { USER_STORE } from '../modules/users/store/user-store';
import { InMemoryUserStore } from '../modules/users/__tests__/in-memory-user.store';
import { createFakeFhir, type FakeFhir } from '../modules/users/__tests__/users-harness';

export interface InfrastructureFakes {
  readonly store: InMemoryUserStore;
  readonly fhir: FakeFhir;
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
  readonly realDatabase?: boolean;
}

export function withInfrastructureFakes(
  builder: TestingModuleBuilder,
  fakes: InfrastructureFakes = createInfrastructureFakes(),
  options: FakeOptions = {},
): TestingModuleBuilder {
  const faked = builder
    .overrideProvider(FHIR_CLIENT)
    .useValue(fakes.fhir)
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
    .useValue(fakes.store)
    .overrideProvider(CLINIC_STORE)
    .useValue(new InMemoryClinicStore());
}
