import { networkProblem, parseProblem } from './problem-parse';
import type { ProblemDetails } from './problem';
import { getAccessToken } from '@/lib/auth/access-token';
import { endRevokedSession, redirectToLogin, refreshSession } from '@/lib/auth/session-client';

export class ApiError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
    this.status = problem.status;
  }

  get errorCode(): ProblemDetails['errorCode'] {
    return this.problem.errorCode;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

interface ApiFetchOptions extends RequestInit {
  /** Set `false` to handle a 401 yourself (no silent refresh, no redirect). */
  readonly retry?: boolean;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // An empty or non-JSON body (204-like 200, an HTML error page from the edge) carries no payload.
    return undefined;
  }
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  const hasBody: boolean = init.body !== undefined && init.body !== null;
  if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token: string | null = getAccessToken();
  if (token !== null && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, headers: buildHeaders(init), credentials: 'same-origin' });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(networkProblem());
  }
}

/** 401 handling: a revoked session ends at once; otherwise one silent refresh and one retry. */
async function recoverFromUnauthorized<T>(path: string, init: ApiFetchOptions, problem: ProblemDetails, canRefresh: boolean): Promise<T> {
  if (problem.errorCode === 'TOKEN_REVOKED') {
    await endRevokedSession();
    throw new ApiError(problem);
  }
  if (init.retry === false) throw new ApiError(problem);
  if (canRefresh && (await refreshSession())) return execute<T>(path, init, false);
  redirectToLogin();
  throw new ApiError(problem);
}

async function execute<T>(path: string, init: ApiFetchOptions, canRefresh: boolean): Promise<T> {
  const { retry: _retry, ...requestInit } = init;
  const response: Response = await send(path, requestInit);
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await readJson(response)) as T;
  }

  const problem: ProblemDetails = parseProblem(response, await readJson(response));
  if (response.status === 401) return recoverFromUnauthorized<T>(path, init, problem, canRefresh);
  throw new ApiError(problem);
}

/**
 * JSON fetch against the BFF (`/api/v1/*`, proxied by Next to the Traefik edge).
 *
 * - attaches the in-memory Bearer token; sends `Content-Type: application/json` only when there is a body;
 * - errors become `ApiError` carrying an RFC 7807 `ProblemDetails` (also for non-JSON edge errors and network failures);
 * - `401 TOKEN_REVOKED` ends the session; any other 401 triggers a single-flight refresh and one retry.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return execute<T>(path, options, true);
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
