/**
 * Minimal FHIR R4 REST client for the workspace seed tools (`tools/*`).
 *
 * The services use `@medcenter/fhir` (a NestJS provider bound to the service
 * env schema); the seeds are plain scripts and only need a handful of
 * interactions, so they talk to HAPI through `fetch` directly. Every non-2xx
 * answer becomes a `FhirHttpError` carrying the status and an excerpt of the
 * `OperationOutcome` — errors are never swallowed.
 *
 * Every request carries `Cache-Control: no-cache`: HAPI reuses an identical
 * search result for a minute by default, and a seed that decides "is this slot
 * already there?" (so as never to overwrite a booked one) must see the live
 * state, not a minute-old page.
 */

export interface FhirResource {
  readonly resourceType: string;
  readonly id?: string;
  readonly [element: string]: unknown;
}

export interface BundleEntryResponse {
  readonly status?: string;
  readonly location?: string;
  readonly etag?: string;
}

export interface BundleEntry {
  readonly resource?: FhirResource;
  readonly response?: BundleEntryResponse;
}

export interface Bundle {
  readonly resourceType: string;
  readonly total?: number;
  readonly entry?: readonly BundleEntry[];
  readonly link?: ReadonlyArray<{ readonly relation?: string; readonly url?: string }>;
}

export interface BundleRequestEntry {
  readonly method: 'PUT' | 'POST' | 'DELETE';
  readonly url: string;
  readonly resource?: FhirResource;
  /** `Bundle.entry.request.ifMatch`: the write only succeeds on this version (`W/"3"`), else `412`. */
  readonly ifMatch?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SearchParams = Readonly<Record<string, string | readonly string[]>>;

const FHIR_JSON = 'application/fhir+json';
const MAX_SEARCH_PAGES = 50;
const ERROR_EXCERPT_LENGTH = 600;
const REQUEST_TIMEOUT_MS = 60_000;

export class FhirHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'FhirHttpError';
  }
}

function isFhirResource(value: unknown): value is FhirResource {
  return typeof value === 'object' && value !== null && typeof (value as { resourceType?: unknown }).resourceType === 'string';
}

export class FhirHttp {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  /** Search with paging: follows `link[relation=next]` until the result set is exhausted. */
  async search(resourceType: string, params: SearchParams = {}): Promise<FhirResource[]> {
    const resources: FhirResource[] = [];
    let nextUrl: string | undefined = this.url(resourceType, params);
    for (let page = 0; nextUrl !== undefined; page += 1) {
      if (page >= MAX_SEARCH_PAGES) {
        throw new Error(`FHIR search ${resourceType} exceeded ${MAX_SEARCH_PAGES} pages`);
      }
      const bundle = (await this.request(nextUrl, { method: 'GET' })) as Bundle;
      for (const entry of bundle.entry ?? []) {
        if (entry.resource !== undefined) {
          resources.push(entry.resource);
        }
      }
      nextUrl = bundle.link?.find((link) => link.relation === 'next')?.url;
    }
    return resources;
  }

  /** `_summary=count` — the server-side total, without transferring resources. */
  async count(resourceType: string, params: SearchParams = {}): Promise<number> {
    const bundle = (await this.request(this.url(resourceType, { ...params, _summary: 'count' }), {
      method: 'GET',
    })) as Bundle;
    return bundle.total ?? 0;
  }

  /** Update-or-create on a client-assigned id (FHIR `PUT <type>/<id>`). */
  async put(resource: FhirResource): Promise<FhirResource> {
    if (resource.id === undefined || resource.id.length === 0) {
      throw new Error(`FHIR PUT ${resource.resourceType} requires a client-assigned id`);
    }
    return this.request(this.url(`${resource.resourceType}/${resource.id}`), {
      method: 'PUT',
      body: JSON.stringify(resource),
    });
  }

  async delete(resourceType: string, id: string): Promise<void> {
    await this.request(this.url(`${resourceType}/${id}`), { method: 'DELETE' });
  }

  /** Posts a `batch` (per-entry outcome) or `transaction` (all-or-nothing) Bundle. */
  async bundle(type: 'batch' | 'transaction', entries: readonly BundleRequestEntry[]): Promise<Bundle> {
    const body = {
      resourceType: 'Bundle',
      type,
      entry: entries.map(({ method, url, resource, ifMatch }) => ({
        ...(resource === undefined ? {} : { resource }),
        request: { method, url, ...(ifMatch === undefined ? {} : { ifMatch }) },
      })),
    };
    return (await this.request(this.baseUrl, { method: 'POST', body: JSON.stringify(body) })) as Bundle;
  }

  /** Type-level operation invoked with GET, e.g. `ValueSet/$expand`. */
  async operation(path: string, params: SearchParams = {}): Promise<FhirResource> {
    return this.request(this.url(path, params), { method: 'GET' });
  }

  url(path: string, params: SearchParams = {}): string {
    const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/${path}`);
    for (const [name, value] of Object.entries(params)) {
      const values: readonly string[] = typeof value === 'string' ? [value] : value;
      values.forEach((item) => url.searchParams.append(name, item));
    }
    return url.toString();
  }

  private async request(url: string, init: RequestInit): Promise<FhirResource> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { accept: FHIR_JSON, 'content-type': FHIR_JSON, 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new FhirHttpError(
        `FHIR ${init.method ?? 'GET'} ${url} failed with ${response.status}: ${text.slice(0, ERROR_EXCERPT_LENGTH)}`,
        response.status,
      );
    }
    const parsed: unknown = text.length === 0 ? { resourceType: 'OperationOutcome' } : JSON.parse(text);
    if (!isFhirResource(parsed)) {
      throw new FhirHttpError(`FHIR ${init.method ?? 'GET'} ${url} returned a non-FHIR body`, response.status);
    }
    return parsed;
  }
}
