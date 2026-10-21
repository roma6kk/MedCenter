import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { createAppQueryClient } from '@/lib/api/query-client';
import type { ProblemDetails } from '@/lib/api/problem';
import type { Slot } from '@/components/catalog/catalog-types';
import { BookingWizard } from './booking-wizard';
import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';

/** Shared fixtures of the wizard specs. Each spec mocks `@/lib/api/api-fetch` and `next/navigation` itself (jest hoisting). */
type Handler = (path: string, options?: RequestInit) => Promise<unknown>;
export const apiFetchMock = apiFetch as jest.MockedFunction<Handler>;

export const DAY: string = shiftDateKey(clinicDateKey(), 2);
export const SERVICE_30 = { id: 'svc-30', name: 'Приём терапевта (первичный)', defaultDurationMin: 30, description: 'Первичная консультация' };
export const SERVICE_20 = { id: 'svc-20', name: 'Приём терапевта (повторный)', defaultDurationMin: 20 };
export const DOCTOR = { id: 'doc-1', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт' };
export const SLOT_30: Slot = { id: 'slot-30', start: `${DAY}T08:00:00.000Z`, end: `${DAY}T08:30:00.000Z`, status: 'free' };
export const SLOT_20: Slot = { id: 'slot-20', start: `${DAY}T09:00:00.000Z`, end: `${DAY}T09:20:00.000Z`, status: 'free' };
const META = { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 };

export function problem(overrides: Partial<ProblemDetails>): ProblemDetails {
  return { title: 'Error', status: 400, errorCode: 'VALIDATION_ERROR', ...overrides };
}

export function postBodies(): ReadonlyArray<unknown> {
  return apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)));
}

export function postKeys(): ReadonlyArray<string | undefined> {
  return apiFetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (init?.headers as Record<string, string> | undefined)?.['Idempotency-Key']);
}

/** The catalog answers as the live API does; `book` decides what POST /appointments does. */
export function serveApi(book: () => Promise<unknown> = () => Promise.resolve({ id: 'appt-1' })): void {
  apiFetchMock.mockImplementation((path, options) => {
    if (options?.method === 'POST') return book();
    if (path.startsWith('/api/v1/services/')) return Promise.resolve(path.endsWith('svc-20') ? SERVICE_20 : SERVICE_30);
    if (path.startsWith('/api/v1/services')) return Promise.resolve({ items: [SERVICE_30, SERVICE_20], meta: META });
    if (path.startsWith('/api/v1/doctors/doc-1/slots')) return Promise.resolve({ doctorId: 'doc-1', from: DAY, to: DAY, items: [SLOT_30, SLOT_20] });
    if (path.startsWith('/api/v1/doctors/doc-1')) return Promise.resolve(DOCTOR);
    if (path.startsWith('/api/v1/doctors')) return Promise.resolve({ items: [DOCTOR], meta: META });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

/** POST /appointments answers with the given outcomes one after another. */
export function serveOutcomes(...outcomes: ReadonlyArray<() => Promise<unknown>>): void {
  const queue: Array<() => Promise<unknown>> = [...outcomes];
  serveApi(() => (queue.shift() ?? (() => Promise.reject(new Error('unexpected extra booking'))))());
}

export function renderWizard(presetDoctorId?: string): void {
  const client = createAppQueryClient();
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<BookingWizard {...(presetDoctorId === undefined ? {} : { presetDoctorId })} />, { wrapper: Wrapper });
}

export async function chooseSlotStep(): Promise<void> {
  await userEvent.click(await screen.findByTestId('service-svc-30'));
  await userEvent.click(await screen.findByTestId('doctor-doc-1'));
}

export async function reachConfirmation(): Promise<void> {
  await chooseSlotStep();
  await userEvent.click(await screen.findByTestId('slot-slot-30'));
  await screen.findByRole('button', { name: 'Подтвердить запись' });
}
