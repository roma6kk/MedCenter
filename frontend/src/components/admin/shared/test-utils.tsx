/**
 * test-utils — helpers for the admin specs (not part of the app bundle: only `*.spec.*` files import it).
 */
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ApiError } from '@/lib/api/api-fetch';
import type { ErrorCode, FieldErrorDetail } from '@/lib/api/problem';

export function renderWithClient(ui: ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}

interface ProblemInput {
  readonly status: number;
  readonly errorCode: ErrorCode;
  readonly detail?: string;
  readonly details?: ReadonlyArray<FieldErrorDetail>;
  readonly requestId?: string;
  readonly retryAfter?: number;
}

/** The `ApiError` a failed `apiFetch` rejects with, built from the parts of an RFC 7807 answer. */
export function apiProblem({ status, errorCode, detail, details, requestId = 'req-test-1', retryAfter }: ProblemInput): ApiError {
  return new ApiError({
    title: 'Problem',
    status,
    errorCode,
    requestId,
    ...(detail === undefined ? {} : { detail }),
    ...(details === undefined ? {} : { details }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
  });
}

export function pageOf<TItem>(items: ReadonlyArray<TItem>, page = 1, totalPages = 1): { items: ReadonlyArray<TItem>; meta: { page: number; pageSize: number; totalItems: number; totalPages: number } } {
  return { items, meta: { page, pageSize: 10, totalItems: items.length, totalPages } };
}
