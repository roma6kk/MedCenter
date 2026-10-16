/**
 * query-client — the app-wide TanStack Query configuration.
 *
 * - retries only transient failures of idempotent reads (offline, 502/503/504), with exponential back-off
 *   (frontend-design-spec §8); a 4xx is final and a mutation is never retried (it could double-submit);
 * - applies the central errorCode side effects (`error-effects.ts`): the "rate limited" and "slot taken" toasts and
 *   the refetch of data a conflict just proved stale.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from './api-fetch';
import { effectsFor, type ErrorSource } from './error-effects';
import { DEFAULT_STALE_TIME_MS } from './query-config';
import { showToast } from '@/lib/ui/toast';

const MAX_READ_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 8_000;
const TRANSIENT_STATUSES: ReadonlyArray<number> = [0, 502, 503, 504];

export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  return isApiError(error) && TRANSIENT_STATUSES.includes(error.status) && failureCount < MAX_READ_RETRIES;
}

export function readRetryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export function applyErrorEffects(client: QueryClient, error: unknown, source: ErrorSource): void {
  if (!isApiError(error)) return;
  const effects = effectsFor(error.problem, source);
  if (effects.toast !== null) showToast(effects.toast.tone, effects.toast.messageKey, effects.toast.values);
  effects.invalidate.forEach((queryKey) => {
    void client.invalidateQueries({ queryKey });
  });
}

export function createAppQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => applyErrorEffects(client, error, 'query') }),
    mutationCache: new MutationCache({ onError: (error) => applyErrorEffects(client, error, 'mutation') }),
    defaultOptions: {
      queries: { staleTime: DEFAULT_STALE_TIME_MS, retry: shouldRetryRead, retryDelay: readRetryDelay, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return client;
}
