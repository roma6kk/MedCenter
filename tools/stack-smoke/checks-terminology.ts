import { pollUntil } from './polling';
import { asArray, bodyObject, expectDefined, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { VALUE_SET_SHAPE } from './smoke-shapes';
import type { ApiResponse } from './smoke-types';
import type { Suite } from './suite';

const GROUP = 'terminology';
const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';
const ATC_VALUE_SET = 'https://fhir.by/ValueSet/atc';
const NSI_VALUE_SET = 'https://fhir.by/ValueSet/nsi-services';

async function valueSetChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions } = suite;
  await runner.check(GROUP, 'GET /terminology/value-sets (admin) -> envelope of the 5 seeded value sets', async () => {
    const items = expectPage(await api.get('/api/v1/terminology/value-sets', { session: sessions.admin }), VALUE_SET_SHAPE);
    expectTrue(items.length >= 5, `expected the 5 seeded value sets, got ${items.length}`);
    expectTrue(items.some((item) => item['url'] === ICD10_VALUE_SET), 'the ICD-10 value set is not listed');
  });
  await runner.check(GROUP, 'GET /terminology/value-sets/{url}/$expand -> ICD-10 codes with J06.9', async () => {
    const path = `/api/v1/terminology/value-sets/${encodeURIComponent(ICD10_VALUE_SET)}/$expand`;
    const response = await api.get(path, { session: sessions.doctor, query: { filter: 'J06' } });
    expectStatus(response, 200);
    expectTrue(codesOf(response).includes('J06.9'), 'J06.9 is not in the expansion of the ICD-10 value set');
  });
  await runner.check(GROUP, 'GET /terminology/expand?system= -> the same expansion by canonical, filtered by display', async () => {
    const response = await api.get('/api/v1/terminology/expand', { session: sessions.doctor, query: { system: ATC_VALUE_SET, filter: 'азит' } });
    expectStatus(response, 200);
    expectTrue(codesOf(response).includes('J01FA10'), 'azithromycin (J01FA10) is not found by its name');
  });
}

function codesOf(response: ApiResponse): string[] {
  return asArray(bodyObject(response)['items'], 'items').map((item) => String((item as Record<string, unknown>)['code']));
}

async function validationChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions } = suite;
  const session = sessions.doctor;
  await runner.check(GROUP, 'GET /terminology/validate -> valid J06.9, invalid Z99.99', async () => {
    const valid = await api.get('/api/v1/terminology/validate', { session, query: { system: ICD10_SYSTEM, code: 'J06.9' } });
    expectStatus(valid, 200);
    expectEqual(expectShape(valid.body, { system: 'string', code: 'string', valid: 'boolean' }, 'validation')['valid'], true, 'valid');
    const invalid = await api.get('/api/v1/terminology/validate', { session, query: { system: ICD10_SYSTEM, code: 'Z99.99' } });
    expectEqual(bodyObject(invalid)['valid'], false, 'valid of an unknown code');
  });
  await runner.check(GROUP, 'GET /terminology/expand of an unseeded value set -> 404 NOT_FOUND', async () => {
    expectProblem(await api.get('/api/v1/terminology/expand', { session, query: { system: 'https://fhir.by/ValueSet/nope' } }), 404, 'NOT_FOUND');
  });
}

/** API §2.3.1-2.3.3: the seeded value sets, their expansion and code validation. */
export async function terminologyReadChecks(suite: Suite): Promise<void> {
  await valueSetChecks(suite);
  await validationChecks(suite);
}

/** API §2.3.4: the snapshot importer. Runs last: it republishes the terminology in the background. */
export async function terminologyImportChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions, config } = suite;
  const session = sessions.admin;
  await runner.check(GROUP, 'POST /admin/terminology/import of an unbundled snapshot -> 422', async () => {
    const response = await api.post('/api/v1/admin/terminology/import', { session, body: { snapshotVersion: '0.0.0' } });
    expectStatus(response, 422);
  });
  await runner.check(GROUP, 'POST /admin/terminology/import of the bundled snapshot -> 202 ACCEPTED', async () => {
    const listed = expectPage(await api.get('/api/v1/terminology/value-sets', { session }), VALUE_SET_SHAPE);
    const snapshot = listed.find((item) => item['url'] === NSI_VALUE_SET);
    const snapshotVersion = String(expectDefined(snapshot, 'the НСИ value set')['version']);
    // 409 means an earlier import still holds the single-flight lock: wait for it instead of failing.
    const accepted = await pollUntil(config, 'the import lock', async () => {
      const response = await api.post('/api/v1/admin/terminology/import', { session, body: { snapshotVersion } });
      if (response.status === 409) {
        return undefined;
      }
      expectStatus(response, 202);
      return response;
    });
    expectEqual(expectShape(accepted.body, { importId: 'string', snapshotVersion: 'string', status: 'string' }, 'import')['status'], 'ACCEPTED', 'status');
  });
}
