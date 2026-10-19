/**
 * doctor-directory — query-string handling and in-memory filtering of the public doctor catalog (`/doctors`).
 *
 * The API filters by `serviceId` and `search` on the server, but its `specialty` filter takes a SNOMED code that
 * the doctor DTO does not expose, so the specialty (a display text) is filtered here, and the page is cut here too:
 * the catalog is one API page (≤ 100 doctors) of a single clinic.
 */
import type { PageMeta, PaginatedResponse } from '@/lib/api/pagination';
import type { Doctor } from './catalog-types';

export const DIRECTORY_PAGE_SIZE = 9;

const MAX_TERM_LENGTH = 100;
/**
 * The API validates ids as FHIR resource ids (`[A-Za-z0-9\-.]{1,64}`, but never only dots) and answers 400 otherwise.
 * `.` and `..` are no ids: `encodeURIComponent` leaves them as they are and a URL parser then folds them into the path.
 */
const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

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

/** An id from the URL (`?doctorId=`, a route segment) that is safe to put into an API path; anything else is dropped. */
export function parseFhirId(raw: string | ReadonlyArray<string> | undefined): string | undefined {
  const value: string | undefined = firstValue(raw);
  return value !== undefined && FHIR_ID_PATTERN.test(value) ? value : undefined;
}

/** Untrusted `searchParams` → safe filters: blank values drop out, a malformed `serviceId` is ignored. */
export function parseDirectoryParams(raw: RawParams): DirectoryParams {
  const serviceId: string | undefined = parseFhirId(raw['serviceId']);
  const specialty: string | undefined = firstValue(raw['specialty'])?.slice(0, MAX_TERM_LENGTH);
  const search: string | undefined = firstValue(raw['search'])?.slice(0, MAX_TERM_LENGTH);
  return {
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(specialty === undefined ? {} : { specialty }),
    ...(search === undefined ? {} : { search }),
    page: pageOf(firstValue(raw['page'])),
  };
}

export function specialtiesOf(doctors: ReadonlyArray<Doctor>): ReadonlyArray<string> {
  const names = new Set<string>();
  doctors.forEach((doctor) => {
    if (doctor.specialty !== undefined && doctor.specialty !== '') names.add(doctor.specialty);
  });
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function filterBySpecialty(doctors: ReadonlyArray<Doctor>, specialty: string | undefined): ReadonlyArray<Doctor> {
  return specialty === undefined ? doctors : doctors.filter((doctor) => doctor.specialty === specialty);
}

export function paginateList<T>(items: ReadonlyArray<T>, page: number, pageSize: number = DIRECTORY_PAGE_SIZE): PaginatedResponse<T> {
  const totalPages: number = Math.ceil(items.length / pageSize);
  const current: number = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const meta: PageMeta = { page: current, pageSize, totalItems: items.length, totalPages };
  return { items: items.slice((current - 1) * pageSize, current * pageSize), meta };
}

/** `/doctors?...` for a filter/page combination; default values (no filter, page 1) leave the URL clean. */
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
  /** Specialties to offer in the filter: those of the loaded doctors, and always the selected one. */
  readonly specialties: ReadonlyArray<string>;
}

/** What `/doctors` shows for the doctors the API returned (already filtered by service and search) and the filters of the URL. */
export function buildDirectory(doctors: ReadonlyArray<Doctor>, params: DirectoryParams): Directory {
  const known: ReadonlyArray<string> = specialtiesOf(doctors);
  const selected: string | undefined = params.specialty;
  const specialties: ReadonlyArray<string> = selected === undefined || known.includes(selected) ? known : [...known, selected].sort((a, b) => a.localeCompare(b, 'ru'));
  return { page: paginateList(filterBySpecialty(doctors, selected), params.page), specialties };
}
