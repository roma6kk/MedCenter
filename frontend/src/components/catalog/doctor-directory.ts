import type { PaginatedResponse } from '@/lib/api/pagination';
import type { Doctor, DoctorQuery } from './catalog-types';

export const DIRECTORY_PAGE_SIZE = 9;

const MAX_TERM_LENGTH = 100;
const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;
const CODE_PATTERN = /^[A-Za-z0-9\-.]{1,64}$/;

export interface DirectoryParams {
  readonly serviceId?: string;
  readonly specialty?: string;
  readonly search?: string;
  readonly page: number;
}

type RawParams = Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;

function firstValue(raw: string | ReadonlyArray<string> | undefined): string | undefined {
  const value: string | undefined = typeof raw === 'string' ? raw : raw?.[0];
  const trimmed: string = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

function pageOf(raw: string | undefined): number {
  const page: number = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function parseFhirId(raw: string | ReadonlyArray<string> | undefined): string | undefined {
  const value: string | undefined = firstValue(raw);
  return value !== undefined && FHIR_ID_PATTERN.test(value) ? value : undefined;
}

export function parseDirectoryParams(raw: RawParams): DirectoryParams {
  const serviceId: string | undefined = parseFhirId(raw['serviceId']);
  const rawSpecialty: string | undefined = firstValue(raw['specialty']);
  const specialty: string | undefined = rawSpecialty !== undefined && CODE_PATTERN.test(rawSpecialty) ? rawSpecialty : undefined;
  const search: string | undefined = firstValue(raw['search'])?.slice(0, MAX_TERM_LENGTH);
  return {
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(specialty === undefined ? {} : { specialty }),
    ...(search === undefined ? {} : { search }),
    page: pageOf(firstValue(raw['page'])),
  };
}

export interface SpecialtyOption {
  readonly code: string;
  readonly label: string;
}

export function specialtiesOf(doctors: ReadonlyArray<Doctor>): ReadonlyArray<SpecialtyOption> {
  const byCode = new Map<string, string>();
  doctors.forEach((doctor) => {
    if (doctor.specialtyCode !== undefined && doctor.specialtyCode !== '') byCode.set(doctor.specialtyCode, doctor.specialty ?? doctor.specialtyCode);
  });
  return [...byCode].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function doctorQueryOf(params: DirectoryParams): DoctorQuery {
  return {
    ...(params.serviceId === undefined ? {} : { serviceId: params.serviceId }),
    ...(params.specialty === undefined ? {} : { specialty: params.specialty }),
    ...(params.search === undefined ? {} : { search: params.search }),
    page: params.page,
    pageSize: DIRECTORY_PAGE_SIZE,
  };
}

export function optionQueryOf(params: DirectoryParams): DoctorQuery {
  return {
    ...(params.serviceId === undefined ? {} : { serviceId: params.serviceId }),
    ...(params.search === undefined ? {} : { search: params.search }),
  };
}

export function directoryHref(params: DirectoryParams): string {
  const search = new URLSearchParams();
  if (params.serviceId !== undefined) search.set('serviceId', params.serviceId);
  if (params.specialty !== undefined) search.set('specialty', params.specialty);
  if (params.search !== undefined) search.set('search', params.search);
  if (params.page > 1) search.set('page', String(params.page));
  const query: string = search.toString();
  return query === '' ? '/doctors' : `/doctors?${query}`;
}

export interface Directory {
  readonly page: PaginatedResponse<Doctor>;
  readonly specialties: ReadonlyArray<SpecialtyOption>;
}

export function buildDirectory(page: PaginatedResponse<Doctor>, optionDoctors: ReadonlyArray<Doctor>): Directory {
  return { page, specialties: specialtiesOf(optionDoctors) };
}
