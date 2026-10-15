import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

type Json = Record<string, unknown>;

export interface FakeTerminologyHapi extends jest.Mocked<FhirClient> {
  /** Every stored resource by `Type/id`. */
  readonly store: Map<string, FhirResource>;
  /** AuditEvents written through `create`. */
  readonly audits: FhirResource[];
  /** Number of upcoming `$expand` answers that come back empty, like a stale HAPI pre-expansion. */
  staleExpansions: number;
}

function conceptsOf(include: Json, codeSystems: readonly FhirResource[]): ReadonlyArray<Json> {
  const listed = include['concept'] as ReadonlyArray<Json> | undefined;
  const source = codeSystems.find((codeSystem) => codeSystem['url'] === include['system']);
  return listed ?? (source?.['concept'] as ReadonlyArray<Json> | undefined) ?? [];
}

function expansionOf(valueSet: FhirResource, store: Map<string, FhirResource>): Json[] {
  const codeSystems = [...store.values()].filter((resource) => resource.resourceType === 'CodeSystem');
  const compose = valueSet['compose'] as { include?: ReadonlyArray<Json> } | undefined;
  return (compose?.include ?? []).flatMap((include) =>
    conceptsOf(include, codeSystems).map((concept) => ({
      system: include['system'],
      code: concept['code'],
      display: concept['display'],
    })),
  );
}

function notFound(): FhirClientError {
  return new FhirClientError('GET', 'http://hapi/fhir/ValueSet/$expand', 404);
}

/**
 * HAPI stand-in with state: `update`/`delete`/`search` by `url`, `$expand` and
 * `$validate-code` computed from what was written, so an import can be run end to end.
 */
export function createFakeTerminologyHapi(): FakeTerminologyHapi {
  const store = new Map<string, FhirResource>();
  const audits: FhirResource[] = [];
  const findValueSet = (url: unknown): FhirResource | undefined =>
    [...store.values()].find((resource) => resource.resourceType === 'ValueSet' && resource['url'] === url);

  const fake = {
    store,
    audits,
    staleExpansions: 0,
    search: jest.fn(async (resourceType: string, params: Record<string, unknown> = {}) => ({
      entry: [...store.values()]
        .filter((resource) => resource.resourceType === resourceType && resource['url'] === params['url'])
        .map((resource) => ({ resource })),
    })),
    update: jest.fn(async (resourceType: string, id: string, resource: FhirResource) => {
      store.set(`${resourceType}/${id}`, resource);
      return resource;
    }),
    delete: jest.fn(async (resourceType: string, id: string) => {
      store.delete(`${resourceType}/${id}`);
    }),
    create: jest.fn(async (resourceType: string, resource: FhirResource) => {
      audits.push(resource);
      return { ...resource, resourceType, id: `audit-${audits.length}` };
    }),
    read: jest.fn(),
    batch: jest.fn(),
    operation: jest.fn(async (_type: string, operation: string, params: Record<string, unknown> = {}) => {
      const valueSet = findValueSet(params['url']);
      if (valueSet === undefined) {
        throw notFound();
      }
      const contains = expansionOf(valueSet, store);
      if (operation === '$validate-code') {
        const found = contains.some((item) => item['system'] === params['system'] && item['code'] === params['code']);
        return { resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: found }] };
      }
      if (fake.staleExpansions > 0) {
        fake.staleExpansions -= 1;
        return { resourceType: 'ValueSet', expansion: { total: 0, contains: [] } };
      }
      return { resourceType: 'ValueSet', expansion: { total: contains.length, contains } };
    }),
  };
  return fake as unknown as FakeTerminologyHapi;
}
