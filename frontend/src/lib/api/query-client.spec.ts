import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-fetch';
import type { ProblemDetails } from './problem';
import { applyErrorEffects, createAppQueryClient, readRetryDelay, shouldRetryRead } from './query-client';
import { queryKeys } from './query-keys';
import { useToastStore } from '@/store/use-toast-store';

function apiError(status: number, errorCode: ProblemDetails['errorCode'], extra: Partial<ProblemDetails> = {}): ApiError {
  return new ApiError({ title: 't', status, errorCode, ...extra });
}

describe('shouldRetryRead', () => {
  it.each([[0], [502], [503], [504]])('should retry a transient status %i up to twice', (status) => {
    expect(shouldRetryRead(0, apiError(status, 'INTERNAL'))).toBe(true);
    expect(shouldRetryRead(1, apiError(status, 'INTERNAL'))).toBe(true);
    expect(shouldRetryRead(2, apiError(status, 'INTERNAL'))).toBe(false);
  });

  it.each([[400, 'VALIDATION_ERROR'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN_ROLE'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [429, 'RATE_LIMITED'], [500, 'INTERNAL']] as const)(
    'should not retry a final %i answer',
    (status, code) => {
      expect(shouldRetryRead(0, apiError(status, code))).toBe(false);
    },
  );

  it('should not retry a programming error', () => {
    expect(shouldRetryRead(0, new TypeError('x is undefined'))).toBe(false);
  });
});

describe('readRetryDelay', () => {
  it('should back off exponentially up to a cap', () => {
    expect([0, 1, 2, 3, 4, 5].map(readRetryDelay)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});

describe('applyErrorEffects', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it('should refetch stale slots and toast when a mutation hits SLOT_CONFLICT', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.slots('d1'), []);

    applyErrorEffects(client, apiError(409, 'SLOT_CONFLICT'), 'mutation');

    expect(client.getQueryState(queryKeys.slots('d1'))?.isInvalidated).toBe(true);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['Слот уже занят']);
  });

  it('should ignore an error that is not an ApiError', () => {
    applyErrorEffects(new QueryClient(), new Error('boom'), 'mutation');

    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('createAppQueryClient', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it('should never retry a mutation', () => {
    expect(createAppQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('should apply the central effects when a mutation fails with RATE_LIMITED', async () => {
    const client = createAppQueryClient();

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(apiError(429, 'RATE_LIMITED', { retryAfter: 12 })) })
      .execute(undefined)
      .catch(() => undefined);

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['Слишком много запросов. Повторите через 12 с.']);
  });
});
