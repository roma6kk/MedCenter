import type { FetchLike, FhirResource } from './fhir-http';

/**
 * Test double for HAPI: just enough of FHIR REST for the seed tools — `PUT`,
 * `DELETE`, `transaction`/`batch` Bundles of PUTs, search by top-level
 * string/reference params, `_summary=count` and `ValueSet/$expand`. Its
 * semantics mirror the real server where the seeds depend on them: `PUT`
 * answers `201` for a new id and `200` for an existing one, a PUT whose body
 * is unchanged does not create a new version, and `$expand?filter=` matches the
 * concept *display* only (HAPI's in-memory expansion does not match codes).
 */

interface StoredResource {
  readonly resource: FhirResource;
  readonly version: number;
}

type Json = Record<string, unknown>;

const FHIR_JSON = { 'content-type': 'application/fhir+json' };
const RESERVED_PARAMS: ReadonlySet<string> = new Set(['_summary', '_count', '_offset', '_elements', '_sort']);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: FHIR_JSON });
}

function outcome(status: number, diagnostics: string): Response {
  return jsonResponse(status, { resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics }] });
}

function referenceOf(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null) {
    const reference = (value as { reference?: unknown }).reference;
    return typeof reference === 'string' ? reference : undefined;
  }
  return undefined;
}

function matchesOne(resource: FhirResource, name: string, value: string): boolean {
  if (name === '_id') {
    return resource.id === value;
  }
  if (name === '_tag') {
    const code = value.split('|').pop();
    const tags = (resource['meta'] as { tag?: ReadonlyArray<{ code?: string }> } | undefined)?.tag ?? [];
    return tags.some((tag) => tag.code === code);
  }
  const field = resource[name];
  return field === value || referenceOf(field) === value;
}

/** A comma-separated value is an OR over its parts, as in FHIR search. */
function matchesParam(resource: FhirResource, name: string, value: string): boolean {
  return value.split(',').some((part) => matchesOne(resource, name, part));
}

function collectCodes(valueSet: FhirResource, codeSystems: readonly FhirResource[]): Json[] {
  const compose = valueSet['compose'] as { include?: ReadonlyArray<Json> } | undefined;
  const contains: Json[] = [];
  for (const include of compose?.include ?? []) {
    const system = include['system'];
    const listed = include['concept'] as ReadonlyArray<Json> | undefined;
    const source = codeSystems.find((codeSystem) => codeSystem['url'] === system);
    const concepts = listed ?? (source?.['concept'] as ReadonlyArray<Json> | undefined) ?? [];
    concepts.forEach((concept) => contains.push({ system, code: concept['code'], display: concept['display'] }));
  }
  return contains;
}

export class InMemoryFhirServer {
  readonly requests: Array<{ readonly method: string; readonly url: string }> = [];
  private readonly store = new Map<string, StoredResource>();

  readonly fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    this.requests.push({ method, url });
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0).slice(1);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as FhirResource) : undefined;
    if (method === 'POST' && segments.length === 0 && body !== undefined) {
      return this.processBundle(body);
    }
    if (method === 'PUT' && segments.length === 2 && body !== undefined) {
      return this.put(body, segments[0] ?? '', segments[1] ?? '');
    }
    if (method === 'DELETE' && segments.length === 2) {
      this.store.delete(`${segments[0]}/${segments[1]}`);
      return jsonResponse(200, { resourceType: 'OperationOutcome' });
    }
    if (method === 'GET' && segments[1] === '$expand') {
      return this.expand(parsed.searchParams.get('url') ?? '', parsed.searchParams.get('filter'));
    }
    if (method === 'GET' && segments[1] === '$validate-code') {
      return this.validateCode(parsed.searchParams);
    }
    if (method === 'GET' && segments.length === 1) {
      return this.search(segments[0] ?? '', parsed.searchParams);
    }
    return outcome(400, `unsupported request ${method} ${parsed.pathname}`);
  };

  all(resourceType: string): FhirResource[] {
    return [...this.store.values()]
      .map((stored) => stored.resource)
      .filter((resource) => resource.resourceType === resourceType);
  }

  count(resourceType: string): number {
    return this.all(resourceType).length;
  }

  versionOf(resourceType: string, id: string): number | undefined {
    return this.store.get(`${resourceType}/${id}`)?.version;
  }

  /** Seeds a pre-existing resource, e.g. a legacy copy left by an earlier run. */
  preload(resource: FhirResource): void {
    this.store.set(`${resource.resourceType}/${resource.id ?? ''}`, { resource, version: 1 });
  }

  private put(resource: FhirResource, type: string, id: string): Response {
    if (resource.resourceType !== type || resource.id !== id) {
      return outcome(400, `body ${resource.resourceType}/${resource.id ?? '?'} does not match ${type}/${id}`);
    }
    const key = `${type}/${id}`;
    const existing = this.store.get(key);
    if (existing === undefined) {
      this.store.set(key, { resource, version: 1 });
      return jsonResponse(201, resource);
    }
    const isChanged = JSON.stringify(existing.resource) !== JSON.stringify(resource);
    this.store.set(key, { resource, version: isChanged ? existing.version + 1 : existing.version });
    return jsonResponse(200, resource);
  }

  private processBundle(bundle: FhirResource): Response {
    const entries = (bundle['entry'] as ReadonlyArray<{ resource?: FhirResource; request?: { method?: string; url?: string } }> | undefined) ?? [];
    const results: Json[] = [];
    for (const entry of entries) {
      const [type = '', id = ''] = (entry.request?.url ?? '').split('/');
      if (entry.request?.method !== 'PUT' || entry.resource === undefined) {
        return outcome(400, `unsupported bundle entry ${entry.request?.method ?? '?'} ${entry.request?.url ?? '?'}`);
      }
      const status = this.put(entry.resource, type, id).status;
      results.push({ response: { status: status === 201 ? '201 Created' : `${status} OK` } });
    }
    return jsonResponse(200, { resourceType: 'Bundle', type: `${String(bundle['type'])}-response`, entry: results });
  }

  private search(resourceType: string, params: URLSearchParams): Response {
    const filters = [...params.entries()].filter(([name]) => !RESERVED_PARAMS.has(name));
    const hits = this.all(resourceType).filter((resource) =>
      filters.every(([name, value]) => matchesParam(resource, name, value)),
    );
    if (params.get('_summary') === 'count') {
      return jsonResponse(200, { resourceType: 'Bundle', type: 'searchset', total: hits.length });
    }
    return jsonResponse(200, {
      resourceType: 'Bundle',
      type: 'searchset',
      total: hits.length,
      entry: hits.map((resource) => ({ resource })),
    });
  }

  private expand(url: string, filter: string | null): Response {
    const valueSet = this.all('ValueSet').find((candidate) => candidate['url'] === url);
    if (valueSet === undefined) {
      return outcome(404, `unknown ValueSet ${url}`);
    }
    const needle = filter?.toLowerCase();
    const contains = collectCodes(valueSet, this.all('CodeSystem')).filter(
      (concept) => needle === undefined || String(concept['display']).toLowerCase().includes(needle),
    );
    return jsonResponse(200, { ...valueSet, expansion: { total: contains.length, contains } });
  }

  /** `result=true` only when the (system, code) pair is a member of the ValueSet. */
  private validateCode(params: URLSearchParams): Response {
    const valueSet = this.all('ValueSet').find((candidate) => candidate['url'] === params.get('url'));
    if (valueSet === undefined) {
      return outcome(404, `unknown ValueSet ${params.get('url') ?? '?'}`);
    }
    const found = collectCodes(valueSet, this.all('CodeSystem')).find(
      (concept) => concept['system'] === params.get('system') && concept['code'] === params.get('code'),
    );
    const parameter: Json[] = [{ name: 'result', valueBoolean: found !== undefined }];
    if (found !== undefined) {
      parameter.push({ name: 'display', valueString: found['display'] });
    }
    return jsonResponse(200, { resourceType: 'Parameters', parameter });
  }
}
