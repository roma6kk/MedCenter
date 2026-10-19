/**
 * doctor-test-utils — shared helpers of the doctor area's specs (never imported by application code).
 *
 * `apiFetch` is mocked per spec file (`jest.mock` is hoisted and must live there); these helpers wire a route table into
 * that mock and wrap a component in a fresh `QueryClient` so no cache leaks between tests.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ApiError } from '@/lib/api/api-fetch';
import type { FieldErrorDetail, ProblemDetails } from '@/lib/api/problem';
import type { EncounterDetails, JournalAppointment } from './doctor-types';

export type ApiMock = jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

export interface ApiRoute {
  /** Upper-case HTTP method; GET when omitted. */
  readonly method?: string;
  /** The route matches a request whose path starts with this prefix (query string included in the request path). */
  readonly path: string;
  readonly respond: (path: string, options?: RequestInit) => unknown;
}

export function problem(status: number, errorCode: ProblemDetails['errorCode'], detail?: string, details?: ReadonlyArray<FieldErrorDetail>): ApiError {
  return new ApiError({ title: errorCode, status, errorCode, ...(detail === undefined ? {} : { detail }), ...(details === undefined ? {} : { details }) });
}

/** Answers every request from the matching route with the longest path (the first one on a tie); an unmatched request fails the test loudly. */
export function routeApi(mock: ApiMock, routes: ReadonlyArray<ApiRoute>): void {
  mock.mockImplementation((path: string, options?: RequestInit) => {
    const method: string = (options?.method ?? 'GET').toUpperCase();
    const route = routes
      .filter((candidate) => (candidate.method ?? 'GET') === method && path.startsWith(candidate.path))
      .reduce<ApiRoute | undefined>((best, candidate) => (best === undefined || candidate.path.length > best.path.length ? candidate : best), undefined);
    if (route === undefined) return Promise.reject(new Error(`unmocked request: ${method} ${path}`));
    try {
      return Promise.resolve(route.respond(path, options));
    } catch (error: unknown) {
      return Promise.reject(error);
    }
  });
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

export type ApiCall = [path: string, options?: RequestInit];

/** The calls made to `path` (prefix match), most useful to assert a body or a query string. */
export function callsTo(mock: ApiMock, path: string, method: string = 'GET'): ReadonlyArray<ApiCall> {
  return mock.mock.calls.filter(([requested, options]) => requested.startsWith(path) && (options?.method ?? 'GET').toUpperCase() === method);
}

export function bodyOf(call: ApiCall | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

/** One page of a list in the `{ items, meta }` envelope every listing endpoint answers. */
export function pageOf<T>(items: ReadonlyArray<T>, page: number = 1, totalPages: number = 1): { items: ReadonlyArray<T>; meta: { page: number; pageSize: number; totalItems: number; totalPages: number } } {
  return { items, meta: { page, pageSize: 20, totalItems: items.length, totalPages } };
}

export function appointment(overrides: Partial<JournalAppointment> = {}): JournalAppointment {
  return {
    id: 'appt-1',
    status: 'booked',
    start: '2026-10-20T06:00:00Z',
    end: '2026-10-20T06:30:00Z',
    slotId: 'slot-1',
    patientId: 'p1',
    doctorId: 'd1',
    practitionerRoleId: 'role-1',
    serviceId: 'srv-1',
    createdAt: '2026-10-16T08:00:00Z',
    patientName: 'Кузнецов Алексей',
    serviceName: 'Консультация терапевта',
    reason: 'Боль в горле',
    ...overrides,
  };
}

export function encounter(overrides: Partial<EncounterDetails> = {}): EncounterDetails {
  return {
    id: 'enc-1',
    status: 'in-progress',
    period: { start: '2026-10-20T06:00:00Z' },
    diagnosisCodes: [],
    appointmentId: 'appt-1',
    patientId: 'p1',
    practitionerRoleId: 'role-1',
    serviceType: { display: 'Консультация терапевта' },
    diagnoses: [],
    observations: [],
    serviceRequests: [],
    medicationRequests: [],
    ...overrides,
  };
}

export const FINISHED_CONTENT: Partial<EncounterDetails> = {
  status: 'finished',
  period: { start: '2026-10-20T06:00:00Z', end: '2026-10-20T06:25:00Z' },
  diagnosisCodes: ['J06.9'],
  summary: 'ОРВИ, состояние удовлетворительное',
  recommendations: 'Покой, обильное питьё',
  diagnoses: [{ code: 'J06.9', display: 'Острый назофарингит', verificationStatus: 'confirmed' }],
  observations: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-observations', code: '8310-5', display: 'Температура тела', value: 36.6, unit: 'Cel' }],
  medicationRequests: [{ atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 3 раза в день', note: 'После еды' }],
  serviceRequests: [{ codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'A01.001', display: 'Консультация', note: 'Повторно' }],
};
