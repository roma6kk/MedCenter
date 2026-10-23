import type { ApiResponse, Session } from './smoke-types';

export interface RequestOptions {
  /** Signed-in caller; omitted for a public call or a deliberate "no token" probe. */
  readonly session?: Session;
  /** A raw `Authorization` value for malformed-token probes. */
  readonly authorization?: string;
  readonly body?: unknown;
  /** A `multipart/form-data` body (a file upload); mutually exclusive with `body`. `fetch` sets the content type and boundary. */
  readonly multipart?: FormData;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
}

/** Called for every answer: the route-coverage tracker listens here. */
export type ResponseListener = (method: string, path: string, status: number) => void;

function withQuery(path: string, query: RequestOptions['query']): string {
  const entries = Object.entries(query ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined);
  if (entries.length === 0) {
    return path;
  }
  return `${path}?${new URLSearchParams(entries.map(([key, value]): [string, string] => [key, String(value)])).toString()}`;
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function authorizationOf(options: RequestOptions): Record<string, string> {
  if (options.authorization !== undefined) {
    return { authorization: options.authorization };
  }
  return options.session === undefined ? {} : { authorization: `Bearer ${options.session.accessToken}` };
}

function bodyOf(options: RequestOptions): { body?: string | FormData } {
  if (options.multipart !== undefined) {
    return { body: options.multipart };
  }
  return options.body === undefined ? {} : { body: JSON.stringify(options.body) };
}

/** A hung answer must fail one check, not hang the suite: no request waits longer than this unless configured. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Whether `fetch` gave up because the `AbortSignal.timeout` fired. */
function isTimeout(error: unknown): boolean {
  // By name, not `instanceof`: the DOMException of `fetch` is not an `Error` of every realm (jest's, for one).
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Thin `fetch` wrapper: one origin (the edge), JSON in and out, nothing printed; every request has a timeout. */
export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly onResponse: ResponseListener = () => undefined,
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  async request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const { status, contentType, text } = await this.exchange(method, path, options);
    this.onResponse(method, path, status);
    return { status, contentType, text, body: parseJson(text) };
  }

  /** The whole answer, body included, under one timeout: a stalled body hangs the suite as surely as a stalled header. */
  private async exchange(method: string, path: string, options: RequestOptions): Promise<Pick<ApiResponse, 'status' | 'contentType' | 'text'>> {
    try {
      const response = await this.fetchWithTimeout(method, path, options);
      return { status: response.status, contentType: response.headers.get('content-type') ?? '', text: await response.text() };
    } catch (error: unknown) {
      if (isTimeout(error)) {
        throw new Error(`${method} ${path} got no answer within ${this.timeoutMs} ms`);
      }
      throw error;
    }
  }

  private fetchWithTimeout(method: string, path: string, options: RequestOptions): Promise<Response> {
    return fetch(`${this.baseUrl}${withQuery(path, options.query)}`, {
      method,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...authorizationOf(options),
        ...options.headers,
      },
      ...bodyOf(options),
    });
  }

  get(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.request('GET', path, options);
  }

  post(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.request('POST', path, options);
  }

  patch(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.request('PATCH', path, options);
  }

  delete(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.request('DELETE', path, options);
  }
}
