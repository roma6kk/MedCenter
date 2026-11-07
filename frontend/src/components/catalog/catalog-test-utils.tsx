import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';
import type { Slot } from './catalog-types';

export const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;

export const SLOT_DAY: string = shiftDateKey(clinicDateKey(), 1);
export const SLOT: Slot = { id: 'slot-1', start: `${SLOT_DAY}T08:00:00.000Z`, end: `${SLOT_DAY}T08:30:00.000Z`, status: 'free' };
export const LATER_SLOT: Slot = { id: 'slot-2', start: `${SLOT_DAY}T10:00:00.000Z`, end: `${SLOT_DAY}T10:30:00.000Z`, status: 'free' };

const META = { page: 1, pageSize: 100, totalItems: 0, totalPages: 1 };

export interface CatalogFixture {
  readonly slots?: Readonly<Record<string, ReadonlyArray<Slot>>>;
  readonly doctorsByService?: Readonly<Record<string, ReadonlyArray<{ readonly id: string }>>>;
  readonly services?: ReadonlyArray<unknown>;
}

export function serveCatalog({ slots = {}, doctorsByService = {}, services = [] }: CatalogFixture = {}): void {
  apiFetchMock.mockImplementation((path) => {
    const slotsOf = /\/api\/v1\/doctors\/([^/]+)\/slots/.exec(path);
    if (slotsOf !== null) return Promise.resolve({ doctorId: slotsOf[1], from: SLOT_DAY, to: SLOT_DAY, items: slots[decodeURIComponent(slotsOf[1] ?? '')] ?? [] });
    const byService = /\/api\/v1\/doctors\?.*serviceId=([^&]+)/.exec(path);
    if (byService !== null) return Promise.resolve({ items: doctorsByService[decodeURIComponent(byService[1] ?? '')] ?? [], meta: META });
    if (path.startsWith('/api/v1/services')) return Promise.resolve({ items: services, meta: META });
    return Promise.resolve({ items: [], meta: META });
  });
}

export function renderWithCatalog(ui: ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}
