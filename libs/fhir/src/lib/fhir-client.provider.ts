import { HttpException, HttpStatus, Logger, type Provider } from '@nestjs/common';
import type { ErrorCode } from '@medcenter/contracts';

/**
 * Minimal FHIR client contract every catalog/clinical service depends on.
 *
 * Kept intentionally narrow: the services only need `search`, `read`,
 * `update`, `create`, `delete`, `batch` and type-level `operation` calls. A
 * concrete implementation backed by `fhir-kit-client` (or any HTTP client)
 * can be swapped in through the `FHIR_CLIENT` token without touching any
 * consumer.
 */
export interface FhirClient {
  search(resourceType: string, params?: Record<string, unknown>): Promise<FhirSearchResult>;
  read(resourceType: string, id: string): Promise<FhirResource>;
  create(resourceType: string, resource: FhirResource): Promise<FhirResource>;
  update(resourceType: string, id: string, resource: FhirResource): Promise<FhirResource>;
  delete(resourceType: string, id: string): Promise<void>;
  /**
   * Invokes a type-level FHIR operation via GET, e.g.
   * `CodeSystem/$lookup?system=...&code=...` or `ValueSet/$expand?url=...`.
   * Returns the `Parameters` (or other) resource the operation responds with.
   */
  operation(
    resourceType: string,
    operation: string,
    params?: Record<string, unknown>,
  ): Promise<FhirResource>;
  /**
   * Submits a FHIR Bundle (batch/transaction) in one HTTP request.
   * Returns the response Bundle whose `entry[].response.status` carries the
   * per-entry outcome (e.g. `201 Created`) for callers to inspect.
   */
  batch(bundle: FhirResource): Promise<FhirResource>;
}

export interface FhirSearchResult {
  readonly total?: number;
  readonly entry?: ReadonlyArray<FhirBundleEntry>;
}

/** Common shape for `Bundle.entry` (search results and batch responses). */
export interface FhirBundleEntry {
  /** Present in search results and for PUT batch entries; batch responses
   *  expose the per-entry outcome through `response` instead. */
  readonly resource: FhirResource;
  readonly response?: {
    readonly status: string;
    readonly location?: string;
    readonly outcome?: unknown;
  };
}

export interface FhirResource {
  readonly resourceType: string;
  readonly id?: string;
  readonly [key: string]: unknown;
}

export const FHIR_CLIENT = Symbol('FHIR_CLIENT');

export interface FhirClientConfig {
  readonly baseUrl: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  /** Per-request timeout in milliseconds (default: {@link DEFAULT_FHIR_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
}

/** NFR-005: a hung HAPI must not hold a request worker forever. */
export const DEFAULT_FHIR_TIMEOUT_MS = 10_000;

/**
 * One `HttpClient` per service, pointed at the internal HAPI URL (ADR-015:
 * our HAPI is the single source of clinical truth). Credentials come from the
 * environment only — never hard-coded, never committed.
 *
 * `fetch` is used instead of a third-party client so the provider stays
 * dependency-free and testable; the FHIR JSON envelope is all the catalog
 * read/write path needs.
 */
export class HttpClient implements FhirClient {
  private readonly logger = new Logger(HttpClient.name);

  constructor(private readonly config: FhirClientConfig) {}

  async search(resourceType: string, params: Record<string, unknown> = {}): Promise<FhirSearchResult> {
    return this.request<FhirSearchResult>('GET', withQuery(resourceType, params));
  }

  async read(resourceType: string, id: string): Promise<FhirResource> {
    return this.request<FhirResource>('GET', `${resourceType}/${encodeURIComponent(id)}`);
  }

  async create(resourceType: string, resource: FhirResource): Promise<FhirResource> {
    return this.request<FhirResource>('POST', resourceType, resource);
  }

  async update(resourceType: string, id: string, resource: FhirResource): Promise<FhirResource> {
    return this.request<FhirResource>(
      'PUT',
      `${resourceType}/${encodeURIComponent(id)}`,
      resource,
    );
  }

  async delete(resourceType: string, id: string): Promise<void> {
    await this.request<undefined>('DELETE', `${resourceType}/${encodeURIComponent(id)}`);
  }

  async operation(
    resourceType: string,
    operation: string,
    params: Record<string, unknown> = {},
  ): Promise<FhirResource> {
    return this.request<FhirResource>('GET', withQuery(`${resourceType}/${operation}`, params));
  }

  async batch(bundle: FhirResource): Promise<FhirResource> {
    return this.request<FhirResource>('POST', '', bundle);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: FhirResource,
  ): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/fhir+json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/fhir+json';
    }
    if (this.config.clientId !== undefined && this.config.clientSecret !== undefined) {
      headers['Authorization'] = `Basic ${Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString('base64')}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_FHIR_TIMEOUT_MS),
      });
    } catch (error) {
      // Network failure or the AbortSignal timeout (DOMException `TimeoutError`).
      const timedOut = isTimeoutError(error);
      this.logger.warn({ method, url, timedOut, err: error }, 'FHIR request failed');
      throw new FhirClientError(method, url, undefined, undefined, { timedOut, cause: error });
    }

    if (!response.ok) {
      // Keep the response body (usually an OperationOutcome) for diagnostics.
      // The same timeout signal covers this read, so a stalled error body is a
      // timeout (504), not a silently dropped body.
      let detail: string | undefined;
      let bodyTimedOut = false;
      try {
        detail = await response.text();
      } catch (readError) {
        bodyTimedOut = isTimeoutError(readError);
      }
      const error = new FhirClientError(method, url, response.status, detail, {
        timedOut: bodyTimedOut,
      });
      if (error.getStatus() >= 500) {
        this.logger.warn({ method, url, status: response.status, body: detail }, 'FHIR request failed');
      }
      throw error;
    }
    if (response.status === 204) {
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      // The same timeout signal covers the body: HAPI can send headers and then stall.
      const timedOut = isTimeoutError(error);
      this.logger.warn({ method, url, timedOut, err: error }, 'FHIR response body could not be read');
      throw new FhirClientError(method, url, response.status, undefined, { timedOut, cause: error });
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/** Builds `<path>?<query>`, skipping empty values. Array values become
 *  repeated parameters (`start=ge…&start=le…`) — FHIR ANDs repeated search
 *  parameters, while a single comma-joined value would mean OR. */
function withQuery(path: string, params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== '') {
        query.append(key, String(item));
      }
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

/**
 * Upstream FHIR failure, already shaped as an API error so it leaves the
 * service through `ProblemDetailsFilter` with a catalogued `errorCode`
 * instead of an anonymous 500:
 * - HAPI 404/410 → `404 NOT_FOUND` (the requested resource does not exist);
 * - HAPI 409/412 → `409 CONFLICT` (version or duplicate conflict on write);
 * - HAPI 400/422 → `500 INTERNAL`: HAPI rejected a request this service built,
 *   so the defect is in our mapping, not in the client's input or in HAPI's
 *   availability;
 * - timeout (headers or body) → `504`, any other failure → `502` (both
 *   `INTERNAL`: the client cannot fix them, and the contract has no dedicated
 *   upstream code).
 *
 * The HAPI URL and the OperationOutcome stay on the error for logs and
 * callers (`upstreamStatus`, `body`) — they are never sent to the client.
 */
export class FhirClientError extends HttpException {
  /** `true` when the request was aborted by the per-request timeout. */
  readonly timedOut: boolean;

  constructor(
    readonly method: string,
    readonly url: string,
    /** HTTP status HAPI answered with; `undefined` when no response arrived. */
    readonly upstreamStatus: number | undefined,
    /** Response body — an OperationOutcome on FHIR error responses. */
    readonly body?: string,
    options: { readonly timedOut?: boolean; readonly cause?: unknown } = {},
  ) {
    const timedOut = options.timedOut ?? false;
    const status = toApiStatus(upstreamStatus, timedOut);
    const errorCode = toErrorCode(status);
    super(
      {
        errorCode,
        message: clientMessage(status),
      },
      status,
      { cause: options.cause },
    );
    this.timedOut = timedOut;
    this.name = 'FhirClientError';
    this.message = timedOut
      ? `FHIR ${method} ${url} timed out`
      : `FHIR ${method} ${url} failed with status ${upstreamStatus ?? 'none'}`;
  }
}

function toApiStatus(upstreamStatus: number | undefined, timedOut: boolean): HttpStatus {
  if (timedOut) {
    return HttpStatus.GATEWAY_TIMEOUT;
  }
  if (upstreamStatus === HttpStatus.NOT_FOUND || upstreamStatus === HttpStatus.GONE) {
    return HttpStatus.NOT_FOUND;
  }
  if (upstreamStatus === HttpStatus.CONFLICT || upstreamStatus === HttpStatus.PRECONDITION_FAILED) {
    return HttpStatus.CONFLICT;
  }
  if (upstreamStatus === HttpStatus.BAD_REQUEST || upstreamStatus === HttpStatus.UNPROCESSABLE_ENTITY) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  return HttpStatus.BAD_GATEWAY;
}

/** Each status has exactly one catalogued code, so status and errorCode never disagree. */
function toErrorCode(status: HttpStatus): ErrorCode {
  switch (status) {
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'INTERNAL';
  }
}

/** Client-facing message; the HAPI URL and OperationOutcome never appear here. */
function clientMessage(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND: requested resource does not exist';
    case HttpStatus.CONFLICT:
      return 'CONFLICT: resource was changed or already exists';
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return 'Внутренняя ошибка сервера';
    default:
      return 'FHIR server is unavailable';
  }
}

/**
 * NestJS provider factory: reads the HAPI base URL and the service's client
 * credentials from the environment (`FHIR_BASE_URL`, `FHIR_CLIENT_ID`,
 * `FHIR_CLIENT_SECRET`) — never from source.
 */
export function createFhirClientProvider(env: NodeJS.ProcessEnv = process.env): Provider {
  return {
    provide: FHIR_CLIENT,
    useFactory: (): FhirClient => {
      const baseUrl = env['FHIR_BASE_URL'];
      if (baseUrl === undefined || baseUrl === '') {
        throw new Error(
          'FHIR_BASE_URL is not configured — the FHIR client cannot be created without it',
        );
      }
      return new HttpClient({
        baseUrl,
        clientId: env['FHIR_CLIENT_ID'],
        clientSecret: env['FHIR_CLIENT_SECRET'],
        timeoutMs: parseTimeout(env['FHIR_TIMEOUT_MS']),
      });
    },
  };
}

/** `FHIR_TIMEOUT_MS` must be a positive integer: `Number('abc')` is NaN and
 *  `AbortSignal.timeout(NaN)` would throw on every request, so a bad value
 *  fails the service at startup instead. */
function parseTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`FHIR_TIMEOUT_MS must be a positive integer, got "${raw}"`);
  }
  return value;
}
