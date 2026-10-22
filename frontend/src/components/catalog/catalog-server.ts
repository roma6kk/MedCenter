/**
 * catalog-server — the server-side (RSC) readers of the public catalog. Anonymous calls straight to the edge, bounded
 * by a timeout (`publicApiFetch`); a failure is a value, so a page renders a banner instead of throwing.
 */
import { toPaginated, type PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import { publicApiFetch, type FetchResult } from '@/lib/server-fetch';
import { CATALOG_PAGE_SIZE, type CatalogService, type Doctor, type DoctorQuery } from './catalog-types';

type ListResult<T> = FetchResult<ReadonlyArray<T>>;

async function loadList<T>(path: string): Promise<ListResult<T>> {
  const result = await publicApiFetch<PaginatedResponse<T> | ReadonlyArray<T>>(path);
  return result.ok ? { ok: true, data: toPaginated(result.data).items } : result;
}

export function loadServices(): Promise<ListResult<CatalogService>> {
  return loadList<CatalogService>(withQuery('/api/v1/services', { pageSize: CATALOG_PAGE_SIZE }));
}

export function loadDoctors(query: DoctorQuery = {}): Promise<ListResult<Doctor>> {
  return loadList<Doctor>(withQuery('/api/v1/doctors', { pageSize: CATALOG_PAGE_SIZE, ...query }));
}

/** One page of doctors as the API pages it (filters and paging on the server). */
export async function loadDoctorPage(query: DoctorQuery): Promise<FetchResult<PaginatedResponse<Doctor>>> {
  const result = await publicApiFetch<PaginatedResponse<Doctor> | ReadonlyArray<Doctor>>(withQuery('/api/v1/doctors', { ...query }));
  return result.ok ? { ok: true, data: toPaginated(result.data) } : result;
}

export function loadDoctor(doctorId: string): Promise<FetchResult<Doctor>> {
  return publicApiFetch<Doctor>(`/api/v1/doctors/${encodeURIComponent(doctorId)}`);
}
