import { networkProblem, parseProblem, serviceUnavailableProblem } from './problem-parse';
import type { ProblemDetails } from './problem';
import { useUiStore } from '@/store/use-ui-store';
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
  readonly retry?: boolean;
  readonly responseAs?: 'json' | 'blob';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', useUiStore.getState().locale);
  const token = getAccessToken();
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

// A 401 from an unreachable token service (restart, rate limit) is not judged: fail like a 503 and stay signed in, instead of redirecting to a dead sign-in.
async function recoverFromUnauthorized<T>(path: string, init: ApiFetchOptions, problem: ProblemDetails, canRefresh: boolean): Promise<T> {
  if (problem.errorCode === 'TOKEN_REVOKED') {
    await endRevokedSession();
    throw new ApiError(problem);
  }
  if (init.retry === false) throw new ApiError(problem);
  if (canRefresh) {
    const outcome = await refreshSession();
    if (outcome === 'ok') return execute<T>(path, init, false);
    if (outcome === 'unavailable') throw new ApiError(serviceUnavailableProblem());
  }
  redirectToLogin();
  throw new ApiError(problem);
}

async function execute<T>(path: string, init: ApiFetchOptions, canRefresh: boolean): Promise<T> {
  const { retry: _retry, responseAs, ...requestInit } = init;
  const response = await send(path, requestInit);
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    if (responseAs === 'blob') return (await response.blob()) as T;
    return (await readJson(response)) as T;
  }

  const problem = parseProblem(response, await readJson(response));
  if (response.status === 401) return recoverFromUnauthorized<T>(path, init, problem, canRefresh);
  throw new ApiError(problem);
}

export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return execute<T>(path, options, true);
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
