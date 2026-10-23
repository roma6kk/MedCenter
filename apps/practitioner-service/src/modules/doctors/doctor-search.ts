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

/** Upper bound of the role scan behind a service/specialty filter: a clinic holds far fewer `PractitionerRole`s. */
export const ROLE_SCAN_LIMIT = 1000;

/**
 * `PractitionerRole` scan for the service and specialty filters, ids only (`_elements=practitioner`).
 * `specialty` is a token (`code` or `system|code`) over `PractitionerRole.specialty`, `service` a reference
 * over `PractitionerRole.healthcareService`, and the name filter chains through `practitioner`
 * (`practitioner.name`). Not paged by HAPI: a doctor may hold several matching roles, so the page
 * and the total have to count distinct doctors ({@link distinctPractitionerIds}).
 */
export function practitionerRoleQuery(filters: DoctorFilters): Readonly<Record<string, unknown>> {
  const serviceId = nonBlank(filters.serviceId);
  const specialty = nonBlank(filters.specialty);
  const search = nonBlank(filters.search);
  return {
    ...(serviceId === undefined ? {} : { service: `HealthcareService/${serviceId}` }),
    ...(specialty === undefined ? {} : { specialty }),
    ...(search === undefined ? {} : { 'practitioner.name': search }),
    _elements: 'practitioner',
    _count: ROLE_SCAN_LIMIT,
  };
}

/**
 * The practitioner ids of a role scan Bundle, each once, in role order. A role without a
 * practitioner reference is skipped.
 */
export function distinctPractitionerIds(entries: ReadonlyArray<FhirBundleEntry>): string[] {
  const ids = entries.flatMap(({ resource }) => {
    const id = resource.resourceType === 'PractitionerRole' ? practitionerIdOf(resource) : undefined;
    return id === undefined ? [] : [id];
  });
  return [...new Set(ids)];
}

/** `Practitioner` search for exactly the doctors of one page (a comma ORs the ids). */
export function practitionersByIdQuery(ids: readonly string[]): Readonly<Record<string, unknown>> {
  return { _id: ids.join(','), _count: ids.length };
}

/** The most roles one page of doctors can bring back; a page holds at most 100 doctors with a handful of roles each. */
export const ROLE_LOOKUP_LIMIT = 200;

/** `PractitionerRole` search over all roles of the given doctors (a comma ORs the references). */
export function practitionerRolesQuery(practitionerIds: readonly string[]): Readonly<Record<string, unknown>> {
  return { practitioner: practitionerIds.map((id) => `Practitioner/${id}`).join(','), _count: ROLE_LOOKUP_LIMIT };
}

/**
 * Ids of the active roles per practitioner id, ascending. A role without an explicit `active=false`
 * counts as active (the element is optional in FHIR); one without a practitioner reference is skipped.
 */
export function roleIdsByPractitioner(entries: ReadonlyArray<FhirBundleEntry>): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>();
  for (const { resource } of entries) {
    const practitionerId = resource.resourceType === 'PractitionerRole' ? practitionerIdOf(resource) : undefined;
    if (practitionerId !== undefined && resource.id !== undefined && resource['active'] !== false) {
      grouped.set(practitionerId, [...(grouped.get(practitionerId) ?? []), resource.id]);
    }
  }
  return new Map([...grouped].map(([id, roleIds]) => [id, [...roleIds].sort()]));
}

function practitionerIdOf(role: FhirResource): string | undefined {
  const { practitioner } = role as { practitioner?: { reference?: unknown } };
  const reference = practitioner?.reference;
  return typeof reference === 'string' ? PRACTITIONER_REFERENCE.exec(reference)?.[1] : undefined;
}
