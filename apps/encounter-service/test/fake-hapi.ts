import { FhirClientError, type FhirClient, type FhirResource, type FhirSearchResult } from '@medcenter/fhir';

type Params = Readonly<Record<string, unknown>>;

interface BundleEntry {
  readonly fullUrl?: string;
  readonly resource: FhirResource;
  readonly request: { readonly method: string; readonly url: string; readonly ifMatch?: string; readonly ifNoneExist?: string };
}

const BASE = 'http://hapi:8080/fhir';
/** Paging/format parameters the fake accepts and ignores (or applies to the page). */
const CONTROL_PARAMS: ReadonlySet<string> = new Set(['_count', '_offset', '_sort', '_total', '_revinclude', '_summary']);

function referencesIn(value: unknown, path: readonly string[]): string[] {
  if (path.length === 0) {
    return typeof value === 'string' ? [value] : [];
  }
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    return value.flatMap((item) => referencesIn(item, path));
  }
  return typeof value === 'object' && value !== null && head !== undefined ? referencesIn((value as Record<string, unknown>)[head], rest) : [];
}

/** Search parameter → element path(s) holding the reference/token it matches. */
const PARAM_PATHS: Readonly<Record<string, readonly string[]>> = {
  _id: ['id'],
  status: ['status'],
  appointment: ['appointment', 'reference'],
  participant: ['participant', 'individual', 'reference'],
  actor: ['participant', 'actor', 'reference'],
};

function matchesParam(resource: FhirResource, key: string, value: unknown): boolean {
  const path = key === 'patient' ? (resource.resourceType === 'Appointment' ? PARAM_PATHS['actor'] : ['subject', 'reference']) : PARAM_PATHS[key];
  if (path === undefined) {
    throw new Error(`FakeHapi: search parameter ${key} is not supported`);
  }
  const accepted = String(value).split(',');
  return referencesIn(resource, path).some((actual) => accepted.includes(actual));
}

/**
 * In-memory HAPI stand-in for the e2e suites. It implements exactly the FHIR
 * semantics this service relies on: versioned resources, `transaction` Bundles
 * applied all-or-nothing, `If-Match` (412 on a stale version), conditional
 * create (`ifNoneExist`), `urn:uuid:` reference rewriting, `_revinclude` on
 * `:encounter`, `_offset`/`_count` paging and `ValueSet/$validate-code` over a
 * fixed set of known codes. Transactions can be held to stage a race.
 */
export class FakeHapi implements FhirClient {
  readonly transactions: FhirResource[] = [];
  private readonly store = new Map<string, FhirResource>();
  private readonly knownCodes: ReadonlySet<string>;
  private sequence = 0;
  private held: Array<() => void> | undefined;

  constructor(knownCodes: readonly string[]) {
    this.knownCodes = new Set(knownCodes);
  }

  seed(...resources: readonly FhirResource[]): void {
    resources.forEach((resource) => this.put(resource));
  }

  stored(resourceType: string): FhirResource[] {
    return [...this.store.values()].filter((resource) => resource.resourceType === resourceType);
  }

  async read(resourceType: string, id: string): Promise<FhirResource> {
    const resource = this.store.get(`${resourceType}/${id}`);
    if (resource === undefined) {
      throw new FhirClientError('GET', `${BASE}/${resourceType}/${id}`, 404, '{}');
    }
    return structuredClone(resource);
  }

  async search(resourceType: string, params: Params = {}): Promise<FhirSearchResult> {
    const filters = Object.entries(params).filter(([key]) => !CONTROL_PARAMS.has(key));
    const matches = this.stored(resourceType).filter((resource) => filters.every(([key, value]) => matchesParam(resource, key, value)));
    if (params['_summary'] === 'count') {
      return { total: matches.length };
    }
    const offset = Number(params['_offset'] ?? 0);
    const page = matches.slice(offset, offset + Number(params['_count'] ?? 100));
    const included = this.revincluded(page, params['_revinclude']);
    return {
      total: matches.length,
      entry: [...page, ...included].map((resource) => ({ resource: structuredClone(resource) })),
    };
  }

  async operation(resourceType: string, operation: string, params: Params = {}): Promise<FhirResource> {
    if (resourceType !== 'ValueSet' || operation !== '$validate-code') {
      throw new FhirClientError('GET', `${BASE}/${resourceType}/${operation}`, 400, '{}');
    }
    const isKnown = this.knownCodes.has(String(params['code']));
    return { resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: isKnown }] };
  }

  /** Holds every transaction until {@link releaseTransactions}; lets two requests read the same version. */
  holdTransactions(): void {
    this.held = [];
  }

  async waitForHeldTransactions(count: number): Promise<void> {
    while ((this.held?.length ?? 0) < count) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  releaseTransactions(): void {
    const waiting = this.held ?? [];
    this.held = undefined;
    waiting.forEach((resume) => resume());
  }

  async batch(bundle: FhirResource): Promise<FhirResource> {
    const held = this.held;
    if (held !== undefined) {
      await new Promise<void>((resume) => held.push(resume));
    }
    return this.applyTransaction((bundle['entry'] as BundleEntry[] | undefined) ?? []);
  }

  async create(): Promise<FhirResource> {
    throw new Error('FakeHapi: encounter-service writes through transactions only');
  }

  async update(): Promise<FhirResource> {
    throw new Error('FakeHapi: encounter-service writes through transactions only');
  }

  async delete(): Promise<void> {
    throw new Error('FakeHapi: encounter-service never deletes');
  }

  /** Synchronous on purpose: a transaction is applied without interleaving, like HAPI's DB transaction. */
  private applyTransaction(entries: readonly BundleEntry[]): FhirResource {
    this.assertVersions(entries);
    const targets = new Map<string, string>();
    const outcomes = entries.map((entry) => this.resolveTarget(entry, targets));
    const rewrite = (resource: FhirResource): FhirResource =>
      JSON.parse(JSON.stringify(resource), (_key, value: unknown) => (typeof value === 'string' ? targets.get(value) ?? value : value));
    entries.forEach((entry, index) => {
      const outcome = outcomes[index];
      if (outcome?.isNew === true) {
        this.put({ ...rewrite(entry.resource), id: outcome.reference.split('/')[1] });
      }
    });
    this.transactions.push({ resourceType: 'Bundle', type: 'transaction', entry: entries });
    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: outcomes.map((outcome) => ({ response: { status: outcome.status, location: `${outcome.reference}/_history/1` } })),
    };
  }

  private assertVersions(entries: readonly BundleEntry[]): void {
    for (const entry of entries) {
      const current = this.store.get(entry.request.url);
      const version = (current?.['meta'] as { versionId?: string } | undefined)?.versionId;
      if (entry.request.ifMatch !== undefined && entry.request.ifMatch !== `W/"${version ?? ''}"`) {
        throw new FhirClientError('POST', BASE, 412, '{"resourceType":"OperationOutcome"}');
      }
    }
  }

  private resolveTarget(entry: BundleEntry, targets: Map<string, string>): { reference: string; status: string; isNew: boolean } {
    if (entry.request.method === 'PUT') {
      return { reference: entry.request.url, status: '200 OK', isNew: true };
    }
    const existing = this.conditionalMatch(entry);
    const reference = existing ?? `${entry.request.url}/${entry.request.url.toLowerCase()}-${(this.sequence += 1)}`;
    if (entry.fullUrl !== undefined) {
      targets.set(entry.fullUrl, reference);
    }
    return { reference, status: existing === undefined ? '201 Created' : '200 OK', isNew: existing === undefined };
  }

  private conditionalMatch(entry: BundleEntry): string | undefined {
    const query = entry.request.ifNoneExist;
    if (query === undefined) {
      return undefined;
    }
    const [key, value] = query.split('=');
    const match = this.stored(entry.request.url).find((resource) => matchesParam(resource, key ?? '', value));
    return match === undefined ? undefined : `${match.resourceType}/${match.id ?? ''}`;
  }

  private revincluded(page: readonly FhirResource[], revinclude: unknown): FhirResource[] {
    const types = (Array.isArray(revinclude) ? revinclude : revinclude === undefined ? [] : [revinclude]).map((item) => String(item).split(':')[0]);
    const refs = new Set(page.map((resource) => `${resource.resourceType}/${resource.id ?? ''}`));
    return [...this.store.values()].filter(
      (resource) => types.includes(resource.resourceType) && referencesIn(resource, ['encounter', 'reference']).some((ref) => refs.has(ref)),
    );
  }

  private put(resource: FhirResource): void {
    const key = `${resource.resourceType}/${resource.id ?? ''}`;
    const previous = (this.store.get(key)?.['meta'] as { versionId?: string } | undefined)?.versionId;
    const versionId = String(Number(previous ?? 0) + 1);
    this.store.set(key, { ...resource, meta: { versionId, lastUpdated: new Date().toISOString() } });
  }
}
