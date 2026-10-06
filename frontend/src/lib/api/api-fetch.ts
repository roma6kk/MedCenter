import type { ProblemDetails } from './problem';
import { getAccessToken, setAccessToken, clearAccessToken } from '@/lib/auth/access-token';

export class ApiError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
    this.status = problem.status;
  }
}

interface ApiFetchOptions extends RequestInit {
  readonly retry?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function singleFlightRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetch('/api/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string };
      if (typeof data.accessToken === 'string' && data.accessToken.length > 0) {
        setAccessToken(data.accessToken);
      }
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function redirectToLogin(): void {
  const returnTo = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { retry = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const problem = (await response.json()) as ProblemDetails;

  if (response.status === 401 && problem.errorCode === 'TOKEN_REVOKED') {
    clearAccessToken();
    await fetch('/api/auth/logout', { method: 'POST' });
    redirectToLogin();
    throw new ApiError(problem);
  }

  if (response.status === 401 && retry) {
    const refreshed = await singleFlightRefresh();
    if (refreshed) return apiFetch<T>(path, { ...options, retry: false });
    redirectToLogin();
    throw new ApiError(problem);
  }

  throw new ApiError(problem);
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
