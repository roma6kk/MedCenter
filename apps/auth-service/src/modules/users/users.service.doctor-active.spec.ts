import { FhirClientError } from '@medcenter/fhir';

import { ADMIN, doctorDto } from './__tests__/users-fixtures';
import { createUsersHarness, transactionWrites, type UsersHarness } from './__tests__/users-harness';

async function seedDoctor(harness: UsersHarness): Promise<string> {
  harness.fhir.read.mockImplementation(async (resourceType: string, id: string) => ({
    resourceType,
    id,
    active: true,
    meta: { versionId: '3' },
    ...(resourceType === 'PractitionerRole' ? { practitioner: { reference: 'Practitioner/pr-1' } } : {}),
  }));
  return (await harness.users.create(doctorDto({ practitionerRoleId: 'role-1' }), ADMIN)).id;
}

function activeWrites(harness: UsersHarness): ReadonlyArray<string> {
  return transactionWrites(harness.fhir).map((write) => `${write.url}=${String(write.resource['active'])}`);
}

describe('a doctor account and the catalog', () => {
  it('should set the PractitionerRole and the Practitioner inactive when the account is deactivated by PATCH', async () => {
    const harness = createUsersHarness();
    const id = await seedDoctor(harness);

    await harness.users.update(id, { isActive: false }, ADMIN);

    expect(activeWrites(harness)).toEqual(['PractitionerRole/role-1=false', 'Practitioner/pr-1=false']);
  });

  it('should set them back to active when the account is activated again', async () => {
    const harness = createUsersHarness();
    const id = await seedDoctor(harness);
    await harness.users.update(id, { isActive: false }, ADMIN);
    harness.fhir.batch.mockClear();

    await harness.users.update(id, { isActive: true }, ADMIN);

    expect(activeWrites(harness)).toEqual(['PractitionerRole/role-1=true', 'Practitioner/pr-1=true']);
  });

  it('should hide the doctor when the account is deactivated by DELETE', async () => {
    const harness = createUsersHarness();
    const id = await seedDoctor(harness);

    await harness.users.deactivate(id, ADMIN);

    expect(activeWrites(harness)).toEqual(['PractitionerRole/role-1=false', 'Practitioner/pr-1=false']);
  });

  it('should keep the account active and answer the HAPI error when the catalog write fails', async () => {
    const harness = createUsersHarness();
    const id = await seedDoctor(harness);
    harness.fhir.batch.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/', 503));

    await expect(harness.users.deactivate(id, ADMIN)).rejects.toBeDefined();

    expect((await harness.store.findById(id))?.isActive).toBe(true);
  });

  it('should not touch HAPI when the account has no PractitionerRole or the activity does not change', async () => {
    const harness = createUsersHarness();
    const id = (await harness.users.create(doctorDto({ email: 'nolink@example.by' }), ADMIN)).id;

    await harness.users.update(id, { isActive: false }, ADMIN);
    await harness.users.update(id, { isActive: false }, ADMIN);

    expect(harness.fhir.batch).not.toHaveBeenCalled();
  });
});
