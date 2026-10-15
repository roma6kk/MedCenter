import type { FhirClient } from '@medcenter/fhir';
import type { EventPublisher } from '@medcenter/messaging';

import { AuditService } from '../../audit/audit.service';
import { AccountFactory } from '../account-factory.service';
import { PasswordHasher } from '../password-hasher';
import { PatientEventsPublisher } from '../patient-events.publisher';
import { PatientProvisioner } from '../patient-provisioner';
import { RegistrationService } from '../registration.service';
import { UsersService } from '../users.service';
import { InMemoryUserStore } from './in-memory-user.store';

export type FakeFhir = jest.Mocked<FhirClient>;

/** HAPI stand-in: Patients get sequential ids, reads carry a version, writes and transaction Bundles are accepted. */
export function createFakeFhir(): FakeFhir {
  let next = 0;
  return {
    search: jest.fn(),
    read: jest
      .fn()
      .mockImplementation(async (resourceType: string, id: string) => ({ resourceType, id, meta: { versionId: '1' } })),
    create: jest.fn().mockImplementation(async (resourceType: string) => {
      next += 1;
      return { resourceType, id: `${resourceType.toLowerCase()}-${next}` };
    }),
    update: jest.fn().mockImplementation(async (resourceType: string, id: string) => ({ resourceType, id })),
    delete: jest.fn().mockResolvedValue(undefined),
    operation: jest.fn(),
    batch: jest.fn().mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] }),
  } as unknown as FakeFhir;
}

export interface UsersHarness {
  readonly store: InMemoryUserStore;
  readonly fhir: FakeFhir;
  readonly publisher: jest.Mocked<EventPublisher>;
  readonly hasher: PasswordHasher;
  readonly accounts: AccountFactory;
  readonly registration: RegistrationService;
  readonly users: UsersService;
}

/** The users module over an in-memory store, a fake HAPI and a fake broker; scrypt runs with cheap parameters. */
export function createUsersHarness(): UsersHarness {
  const store = new InMemoryUserStore();
  const fhir = createFakeFhir();
  const publisher = { publish: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<EventPublisher>;
  const hasher = new PasswordHasher({ N: 2 ** 10, r: 8, p: 1 });
  const patients = new PatientProvisioner(fhir);
  const audit = new AuditService(fhir);
  const accounts = new AccountFactory(store, hasher, patients, audit, new PatientEventsPublisher(publisher));
  const registration = new RegistrationService(accounts);
  const users = new UsersService(store, accounts, patients, audit);
  return { store, fhir, publisher, hasher, accounts, registration, users };
}

/** FHIR `create` calls of one resource type, as `[resourceType, resource]` tuples. */
export function createdOf(fhir: FakeFhir, resourceType: string): ReadonlyArray<Record<string, unknown>> {
  return fhir.create.mock.calls
    .filter(([type]) => type === resourceType)
    .map(([, resource]) => resource as unknown as Record<string, unknown>);
}

/** The single write of each transaction Bundle sent to HAPI: `[url, ifMatch, resource]`. */
export function transactionWrites(fhir: FakeFhir): ReadonlyArray<{
  readonly url: string;
  readonly ifMatch: string | undefined;
  readonly resource: Record<string, unknown>;
}> {
  return fhir.batch.mock.calls.flatMap(([bundle]) =>
    ((bundle['entry'] as ReadonlyArray<Record<string, unknown>>) ?? []).map((entry) => {
      const request = entry['request'] as { readonly url: string; readonly ifMatch?: string };
      return { url: request.url, ifMatch: request.ifMatch, resource: entry['resource'] as Record<string, unknown> };
    }),
  );
}
