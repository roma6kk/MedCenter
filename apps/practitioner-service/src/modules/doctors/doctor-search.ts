import type { FhirBundleEntry, FhirResource } from '@medcenter/fhir';

/** `GET /doctors` filters (API §4.1); every field is optional. */
export interface DoctorFilters {
  readonly serviceId?: string;
  readonly specialty?: string;
  readonly search?: string;
}

/** The HAPI paging window for one API page; `_total` makes HAPI report the match count for the §0 envelope. */
export interface PageWindow {
  readonly _count: number;
  readonly _offset: number;
  readonly _total: 'accurate';
}

/** The HAPI window of API page `page` (1-based) holding `pageSize` rows. */
export function pageWindow(page: number, pageSize: number): PageWindow {
  return { _count: pageSize, _offset: (page - 1) * pageSize, _total: 'accurate' };
}

/** Brings the `Practitioner` of every matched `PractitionerRole` into the same Bundle. */
export const PRACTITIONER_ROLE_INCLUDE = 'PractitionerRole:practitioner';

const PRACTITIONER_REFERENCE = /(?:^|\/)Practitioner\/([^/]+)$/;

function nonBlank(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/** `true` when the doctor catalog has to go through `PractitionerRole` (service or specialty filter). */
export function needsRoleSearch(filters: DoctorFilters): boolean {
  return nonBlank(filters.serviceId) !== undefined || nonBlank(filters.specialty) !== undefined;
}

/**
 * Plain `Practitioner` search: only the name filter and the page window. R4 has
 * no `Practitioner?qualification-code` (HAPI answers 400 HAPI-0524), so the
 * specialty cannot be asked of `Practitioner`; see {@link practitionerRoleQuery}.
 */
export function practitionerQuery(
  filters: DoctorFilters,
  window: PageWindow,
): Readonly<Record<string, unknown>> {
  const search = nonBlank(filters.search);
  return { ...(search === undefined ? {} : { name: search }), ...window };
}

/**
 * `PractitionerRole` search for the service and specialty filters. `specialty`
 * is a token (`code` or `system|code`) over `PractitionerRole.specialty`,
 * `service` a reference over `PractitionerRole.healthcareService`, and the name
 * filter chains through `practitioner` (`practitioner.name`). The doctors come
 * back as `_include`d `Practitioner`s in the same Bundle, so one request answers.
 */
export function practitionerRoleQuery(
  filters: DoctorFilters,
  window: PageWindow,
): Readonly<Record<string, unknown>> {
  const serviceId = nonBlank(filters.serviceId);
  const specialty = nonBlank(filters.specialty);
  const search = nonBlank(filters.search);
  return {
    ...(serviceId === undefined ? {} : { service: `HealthcareService/${serviceId}` }),
    ...(specialty === undefined ? {} : { specialty }),
    ...(search === undefined ? {} : { 'practitioner.name': search }),
    _include: PRACTITIONER_ROLE_INCLUDE,
    ...window,
  };
}

/**
 * The included `Practitioner`s of a role search Bundle, in role order. A
 * practitioner holding several roles on the page is listed once; a role whose
 * practitioner is missing from the Bundle is skipped.
 */
export function practitionersOfRoles(entries: ReadonlyArray<FhirBundleEntry>): FhirResource[] {
  const resources = entries.map((entry) => entry.resource);
  const included = new Map(
    resources
      .filter((resource) => resource.resourceType === 'Practitioner' && resource.id !== undefined)
      .map((practitioner) => [practitioner.id, practitioner]),
  );
  const listed = new Set<string>();
  const practitioners: FhirResource[] = [];
  for (const role of resources.filter((resource) => resource.resourceType === 'PractitionerRole')) {
    const id = practitionerIdOf(role);
    const practitioner = id === undefined ? undefined : included.get(id);
    if (id !== undefined && practitioner !== undefined && !listed.has(id)) {
      listed.add(id);
      practitioners.push(practitioner);
    }
  }
  return practitioners;
}

function practitionerIdOf(role: FhirResource): string | undefined {
  const { practitioner } = role as { practitioner?: { reference?: unknown } };
  const reference = practitioner?.reference;
  return typeof reference === 'string' ? PRACTITIONER_REFERENCE.exec(reference)?.[1] : undefined;
}
