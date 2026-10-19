/**
 * catalog-types — response shapes of the public catalog, as the live services answer them
 * (`GET /doctors`, `/doctors/{id}`, `/services`, `/doctors/{id}/slots`; api-designer-spec §4–§5).
 */
import type { PaginatedResponse } from '@/lib/api/pagination';

export interface Doctor {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** "Имя Фамилия", ready to display. */
  readonly name: string;
  /** Display text of the specialty; absent when the practitioner has no qualification. */
  readonly specialty?: string;
}

export interface CatalogService {
  readonly id: string;
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly typeDisplay?: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
  readonly isActive: boolean;
}

/** `entered-in-error` only shows up in the admin slot grid; the public search answers `free` slots. */
export type SlotStatus = 'free' | 'busy' | 'entered-in-error';

export interface Slot {
  readonly id: string;
  readonly scheduleId?: string;
  /** RFC 3339 UTC. */
  readonly start: string;
  readonly end: string;
  readonly status: SlotStatus;
}

export interface DoctorSlots {
  readonly doctorId: string;
  readonly from: string;
  readonly to: string;
  readonly items: ReadonlyArray<Slot>;
  /** Present (and `true`) when the search hit its page cap: later days may be missing. */
  readonly truncated?: true;
}

export type DoctorPage = PaginatedResponse<Doctor>;
export type ServicePage = PaginatedResponse<CatalogService>;

/** The API caps `pageSize` at 100; the clinic catalog is small enough to load in one page. */
export const CATALOG_PAGE_SIZE = 100;

export interface DoctorQuery {
  readonly serviceId?: string;
  readonly specialty?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
