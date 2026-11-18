import { HttpException, HttpStatus, Logger, type Provider } from '@nestjs/common';
import type { ErrorCode } from '@medcenter/contracts';

export interface FhirClient {
  search(resourceType: string, params?: Record<string, unknown>): Promise<FhirSearchResult>;
  read(resourceType: string, id: string): Promise<FhirResource>;
  create(resourceType: string, resource: FhirResource): Promise<FhirResource>;
  update(resourceType: string, id: string, resource: FhirResource): Promise<FhirResource>;
  delete(resourceType: string, id: string): Promise<void>;
  operation(
    resourceType: string,
    operation: string,
    params?: Record<string, unknown>,
    options?: FhirOperationOptions,
  ): Promise<FhirResource>;
  batch(bundle: FhirResource): Promise<FhirResource>;
}

export interface FhirOperationOptions {
  readonly method?: 'GET' | 'POST';
  readonly id?: string;
}

export interface FhirSearchResult {
  readonly total?: number;
  readonly entry?: ReadonlyArray<FhirBundleEntry>;
}

export interface FhirBundleEntry {
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

interface RequestOptions {
  readonly bypassSearchCache?: boolean;
}

export interface FhirClientConfig {
  readonly baseUrl: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly timeoutMs?: number;
}

export const DEFAULT_FHIR_TIMEOUT_MS = 10_000;

export class HttpClient implements FhirClient {
  private readonly logger = new Logger(HttpClient.name);

  constructor(private readonly config: FhirClientConfig) {}

  async search(resourceType: string, params: Record<string, unknown> = {}): Promise<FhirSearchResult> {
    return this.request<FhirSearchResult>('GET', withQuery(resourceType, params), undefined, { bypassSearchCache: true });
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
    options: FhirOperationOptions = {},
  ): Promise<FhirResource> {
    const target = options.id === undefined ? resourceType : `${resourceType}/${encodeURIComponent(options.id)}`;
    if (options.method === 'POST') {
      return this.request<FhirResource>('POST', `${target}/${operation}`, toParameters(params));
    }
    return this.request<FhirResource>('GET', withQuery(`${target}/${operation}`, params));
  }

  async batch(bundle: FhirResource): Promise<FhirResource> {
    return this.request<FhirResource>('POST', '', bundle);
  }

  private async request<T>(method: string, path: string, body?: FhirResource, options: RequestOptions = {}): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/${path}`;
    const response = await this.send(method, url, body, options);
    if (!response.ok) {
      throw await this.failureOf(method, url, response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return this.readJson<T>(method, url, response);
  }

  private headersFor(options: RequestOptions, hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/fhir+json' };
    if (options.bypassSearchCache === true) {
      // HAPI serves an identical search from its result cache for a minute; callers that decide 'does it exist yet?' need live data, so searches opt out.
      headers['Cache-Control'] = 'no-cache';
    }
    if (hasBody) {
      headers['Content-Type'] = 'application/fhir+json';
    }
    if (this.config.clientId !== undefined && this.config.clientSecret !== undefined) {
      const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    return headers;
  }

  private async send(method: string, url: string, body: FhirResource | undefined, options: RequestOptions): Promise<Response> {
    try {
      return await fetch(url, {
        method,
        headers: this.headersFor(options, body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_FHIR_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = isTimeoutError(error);
      this.logger.warn({ method, url, timedOut, err: error }, 'FHIR request failed');
      throw new FhirClientError(method, url, undefined, undefined, { timedOut, cause: error });
    }
  }

  /** The same timeout covers the error body: a stalled body is a 504, not a dropped one. */
  private async failureOf(method: string, url: string, response: Response): Promise<FhirClientError> {
    let detail: string | undefined;
    let bodyTimedOut = false;
    try {
      detail = await response.text();
    } catch (readError) {
      bodyTimedOut = isTimeoutError(readError);
    }
    const error = new FhirClientError(method, url, response.status, detail, { timedOut: bodyTimedOut });
    if (error.getStatus() >= 500) {
      this.logger.warn({ method, url, status: response.status, body: detail }, 'FHIR request failed');
    }
    return error;
  }

  private async readJson<T>(method: string, url: string, response: Response): Promise<T> {
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

function toParameters(params: Record<string, unknown>): FhirResource {
  const parameter = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => {
      if (typeof value === 'boolean') {
        return { name, valueBoolean: value };
      }
      if (typeof value === 'number') {
        return { name, valueInteger: value };
      }
      return { name, valueString: String(value) };
    });
  return { resourceType: 'Parameters', parameter };
}

/** Array values become repeated parameters: FHIR ANDs those, while one comma-joined value would be an OR. */
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

/** HAPI failure shaped as an API error: 404/410 -> 404, 409/412 -> 409, 400/422 -> 500 (our mapping is at fault), timeout -> 504, other -> 502. The HAPI URL and body are never sent to the client. */
export class FhirClientError extends HttpException {
  readonly timedOut: boolean;

  constructor(
    readonly method: string,
    readonly url: string,
    readonly upstreamStatus: number | undefined,
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

const ERROR_CODE_BY_STATUS: Partial<Record<HttpStatus, ErrorCode>> = {
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
};

function toErrorCode(status: HttpStatus): ErrorCode {
  return ERROR_CODE_BY_STATUS[status] ?? 'INTERNAL';
}

const CLIENT_MESSAGES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND: requested resource does not exist',
  [HttpStatus.CONFLICT]: 'CONFLICT: resource was changed or already exists',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
};

function clientMessage(status: HttpStatus): string {
  return CLIENT_MESSAGES[status] ?? 'FHIR server is unavailable';
}

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
        clientId: nonBlank(env['FHIR_CLIENT_ID']),
        clientSecret: nonBlank(env['FHIR_CLIENT_SECRET']),
        timeoutMs: parseTimeout(env['FHIR_TIMEOUT_MS']),
      });
    },
  };
}

function nonBlank(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** A non-numeric value would make `AbortSignal.timeout(NaN)` throw on every request, so it fails at startup. */
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
