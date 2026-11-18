import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useSessionStore } from '@/store/use-session-store';
import { useToastStore } from '@/store/use-toast-store';
import { useUiStore } from '@/store/use-ui-store';

export function apiProblem(status: number, errorCode: ProblemDetails['errorCode'], overrides: Partial<ProblemDetails> = {}): ApiError {
  return new ApiError({ title: errorCode, status, errorCode, ...overrides });
}

export function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

export function renderWithClient(ui: ReactElement, client: QueryClient = newQueryClient()): RenderResult {
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}

export function pageOf<TItem>(items: ReadonlyArray<TItem>, meta: Partial<PaginatedResponse<TItem>['meta']> = {}): PaginatedResponse<TItem> {
  const pageSize: number = meta.pageSize ?? 10;
  const totalItems: number = meta.totalItems ?? items.length;
  return { items, meta: { page: 1, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize), ...meta } };
}

export function resetCabinetState(): void {
  useUiStore.setState({ locale: 'ru' });
  useToastStore.setState({ toasts: [] });
  useSessionStore.setState({ accessToken: null, expiresAt: null, role: 'PATIENT', scope: null, patientRef: null, fhirUser: null, hydrated: true });
}

export function expectWraps(element: HTMLElement): void {
  expect(element).toHaveClass('min-w-0');
  expect(element).toHaveClass('[overflow-wrap:anywhere]');
}
