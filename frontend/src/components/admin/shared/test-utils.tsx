import { render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

export async function chooseRowAction(rowName: string, action: string): Promise<void> {
  const trigger = (await screen.findAllByRole('button', { name: `Действия: ${rowName}` }))[0] as HTMLElement;
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('menuitem', { name: action }));
}

export async function firstButton(name: string): Promise<HTMLElement> {
  return (await screen.findAllByRole('button', { name }))[0] as HTMLElement;
}

export function answerMethod(method: string, outcome: () => Promise<unknown>, listing: unknown): (path: string, options?: RequestInit) => Promise<unknown> {
  return (_path, options) => (options?.method === method ? outcome() : Promise.resolve(listing));
}

export function pagedAfterDelete<TItem>(listPath: string, firstPage: ReadonlyArray<TItem>, lastPage: ReadonlyArray<TItem>): (path: string, options?: RequestInit) => Promise<unknown> {
  let isDeleted = false;
  const meta = (page: number, totalPages: number): { page: number; pageSize: number; totalItems: number; totalPages: number } => ({ page, pageSize: 10, totalItems: 11, totalPages });
  return (path, options) => {
    if (options?.method === 'DELETE') {
      isDeleted = true;
      return Promise.resolve(undefined);
    }
    if (path === `${listPath}?page=2&pageSize=10`) return Promise.resolve({ items: isDeleted ? [] : lastPage, meta: meta(2, isDeleted ? 1 : 2) });
    return Promise.resolve({ items: firstPage, meta: meta(1, isDeleted ? 1 : 2) });
  };
}
