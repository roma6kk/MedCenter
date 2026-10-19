/**
 * catalog-api — browser-side readers of the public catalog (api-designer-spec §4.1–4.2, §5.1.1–5.1.2, §5.2.8).
 * The server-rendered pages use `catalog-server.ts`; both ask the same endpoints.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import { toPaginated } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import type { SlotWindow } from '@/components/booking/slot-time';
import { CATALOG_PAGE_SIZE, type CatalogService, type Doctor, type DoctorPage, type DoctorQuery, type DoctorSlots, type ServicePage } from './catalog-types';

export async function fetchServices(): Promise<ServicePage> {
  return toPaginated(await apiFetch<ServicePage>(withQuery('/api/v1/services', { pageSize: CATALOG_PAGE_SIZE })));
}

export function fetchService(serviceId: string): Promise<CatalogService> {
  return apiFetch<CatalogService>(`/api/v1/services/${encodeURIComponent(serviceId)}`);
}

export async function fetchDoctors(query: DoctorQuery = {}): Promise<DoctorPage> {
  const params = { pageSize: CATALOG_PAGE_SIZE, ...query };
  return toPaginated(await apiFetch<DoctorPage>(withQuery('/api/v1/doctors', params)));
}

export function fetchDoctor(doctorId: string): Promise<Doctor> {
  return apiFetch<Doctor>(`/api/v1/doctors/${encodeURIComponent(doctorId)}`);
}

/** Free slots of one doctor; `from`/`to` are clinic calendar days (inclusive), at most 31 days apart. */
export function fetchDoctorSlots(doctorId: string, window: SlotWindow): Promise<DoctorSlots> {
  return apiFetch<DoctorSlots>(withQuery(`/api/v1/doctors/${encodeURIComponent(doctorId)}/slots`, { from: window.from, to: window.to }));
}
