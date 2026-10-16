import { asArray, bodyObject, expectEqual, expectStatus, expectTrue } from './smoke-assert';
import type { ApiClient } from './smoke-http';
import type { SmokeRunner } from './smoke-runner';

const GROUP = 'edge';
const SMART_SCOPES = ['launch', 'patient/*.read', 'patient/*.write', 'user/*.read', 'user/*.write'];

/** HAPI is published through the edge for exactly one read: the CapabilityStatement (NFR-010). */
async function fhirChecks(runner: SmokeRunner, api: ApiClient): Promise<void> {
  await runner.check(GROUP, 'GET /fhir/metadata -> 200 CapabilityStatement, fhirVersion 4.0.1', async () => {
    const response = await api.get('/fhir/metadata');
    expectStatus(response, 200);
    const body = bodyObject(response);
    expectEqual(body['resourceType'], 'CapabilityStatement', 'resourceType');
    expectEqual(body['fhirVersion'], '4.0.1', 'fhirVersion');
  });
  await runner.check(GROUP, 'GET /fhir/Patient -> 404 (HAPI is not published through the edge)', async () => {
    expectStatus(await api.get('/fhir/Patient'), 404);
  });
  await runner.check(GROUP, 'POST /fhir/Patient and GET /fhir/Patient/1 -> 404', async () => {
    expectStatus(await api.post('/fhir/Patient', { body: { resourceType: 'Patient' } }), 404);
    expectStatus(await api.get('/fhir/Patient/1'), 404);
  });
}

/** The public auth documents every client and every BFF reads. */
async function authDocumentChecks(runner: SmokeRunner, api: ApiClient): Promise<void> {
  await runner.check(GROUP, 'GET /.well-known/jwks.json -> 200 with an RS256-capable RSA key', async () => {
    const response = await api.get('/.well-known/jwks.json');
    expectStatus(response, 200);
    const keys = asArray(bodyObject(response)['keys'], 'keys');
    expectTrue(keys.length > 0, 'the JWKS publishes no key');
    expectEqual((keys[0] as Record<string, unknown>)['kty'], 'RSA', 'keys[0].kty');
  });
  await runner.check(GROUP, 'GET /.well-known/smart-configuration -> 200 with the five SMART scopes', async () => {
    const response = await api.get('/.well-known/smart-configuration');
    expectStatus(response, 200);
    const scopes = asArray(bodyObject(response)['scopes_supported'], 'scopes_supported');
    for (const scope of SMART_SCOPES) {
      expectTrue(scopes.includes(scope), `scopes_supported lacks ${scope}`);
    }
  });
}

/** Traefik and the public documents; none of this needs a token. */
export async function edgeChecks(runner: SmokeRunner, api: ApiClient): Promise<void> {
  await fhirChecks(runner, api);
  await authDocumentChecks(runner, api);
}
