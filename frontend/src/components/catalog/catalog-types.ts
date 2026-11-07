import type { PaginatedResponse } from '@/lib/api/pagination';

export interface Doctor {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName?: string;
  readonly name: string;
  readonly specialty?: string;
  readonly specialtyCode?: string;
  readonly specialtySystem?: string;
  readonly photoUrl?: string;
  readonly practitionerRoleIds?: ReadonlyArray<string>;
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

export type SlotStatus = 'free' | 'busy' | 'entered-in-error';

export interface Slot {
  readonly id: string;
  readonly scheduleId?: string;
  readonly serviceId?: string;
  readonly start: string;
  readonly end: string;
  readonly status: SlotStatus;
}

export interface DoctorSlots {
  readonly doctorId: string;
  readonly from: string;
  readonly to: string;
  readonly items: ReadonlyArray<Slot>;
  readonly truncated?: true;
}

export type DoctorPage = PaginatedResponse<Doctor>;
export type ServicePage = PaginatedResponse<CatalogService>;

export const CATALOG_PAGE_SIZE = 100;

export interface DoctorQuery {
  readonly serviceId?: string;
  readonly specialty?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
