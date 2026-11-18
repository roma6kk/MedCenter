import type { FhirBundleEntry, FhirResource } from '@medcenter/fhir';

export interface DoctorFilters {
  readonly serviceId?: string;
  readonly specialty?: string;
  readonly search?: string;
}

export interface PageWindow {
  readonly _count: number;
  readonly _offset: number;
  readonly _total: 'accurate';
}

export function pageWindow(page: number, pageSize: number): PageWindow {
  return { _count: pageSize, _offset: (page - 1) * pageSize, _total: 'accurate' };
}

const PRACTITIONER_REFERENCE = /(?:^|\/)Practitioner\/([^/]+)$/;

function nonBlank(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

export function needsRoleSearch(filters: DoctorFilters): boolean {
  return nonBlank(filters.serviceId) !== undefined || nonBlank(filters.specialty) !== undefined;
}

// `:not` also matches a resource without `active` (optional in FHIR).
const NOT_DEACTIVATED = { 'active:not': 'false' } as const;

// R4 has no `Practitioner?qualification-code` (HAPI 400 HAPI-0524): the specialty goes through PractitionerRole.
export function practitionerQuery(window: PageWindow): Readonly<Record<string, unknown>> {
  return { ...NOT_DEACTIVATED, ...window };
}

export const PRACTITIONER_SCAN_CHUNK = 100;
export const PRACTITIONER_SCAN_LIMIT = 1_000;

export function practitionerScanQuery(offset: number): Readonly<Record<string, unknown>> {
  return { ...NOT_DEACTIVATED, _count: PRACTITIONER_SCAN_CHUNK, _offset: offset };
}

// HAPI `name` misses the English name and two-word names, so the service matches the term itself.
export function searchTerm(filters: DoctorFilters): string | undefined {
  return nonBlank(filters.search);
}

const ROLE_SCAN_LIMIT = 1000;

// `PractitionerRole.healthcareService` is not used: only the demo seed writes it, a new service would list no doctor.
export function serviceScheduleQuery(serviceId: string): Readonly<Record<string, unknown>> {
  return { actor: `HealthcareService/${serviceId}`, ...NOT_DEACTIVATED, _elements: 'actor', _count: ROLE_SCAN_LIMIT };
}

const ROLE_REFERENCE = /(?:^|\/)PractitionerRole\/([^/]+)$/;

export function roleIdsOfSchedules(entries: ReadonlyArray<FhirBundleEntry>): string[] {
  const ids = entries.flatMap(({ resource }) => {
    const actors = resource.resourceType === 'Schedule' ? (resource as { actor?: ReadonlyArray<{ reference?: unknown }> }).actor : undefined;
    return (actors ?? []).flatMap((actor) => {
      const id = typeof actor.reference === 'string' ? ROLE_REFERENCE.exec(actor.reference)?.[1] : undefined;
      return id === undefined ? [] : [id];
    });
  });
  return [...new Set(ids)];
}

// HAPI does not page by doctor (one doctor may hold several matching roles), so pages and total count distinct doctors.
export function practitionerRoleQuery(filters: DoctorFilters, roleIds?: readonly string[]): Readonly<Record<string, unknown>> {
  const specialty = nonBlank(filters.specialty);
  return {
    ...(roleIds === undefined ? {} : { _id: roleIds.join(',') }),
    ...(specialty === undefined ? {} : { specialty }),
    ...NOT_DEACTIVATED,
    _elements: 'practitioner',
    _count: ROLE_SCAN_LIMIT,
  };
}

export function hasServiceFilter(filters: DoctorFilters): boolean {
  return nonBlank(filters.serviceId) !== undefined;
}

export function distinctPractitionerIds(entries: ReadonlyArray<FhirBundleEntry>): string[] {
  const ids = entries.flatMap(({ resource }) => {
    const id = resource.resourceType === 'PractitionerRole' ? practitionerIdOf(resource) : undefined;
    return id === undefined ? [] : [id];
  });
  return [...new Set(ids)];
}

export const ID_LOOKUP_CHUNK = 100;

export function practitionersByIdQuery(ids: readonly string[]): Readonly<Record<string, unknown>> {
  return { _id: ids.join(','), ...NOT_DEACTIVATED, _count: ids.length };
}

const ROLE_LOOKUP_LIMIT = 200;

export function practitionerRolesQuery(practitionerIds: readonly string[]): Readonly<Record<string, unknown>> {
  return { practitioner: practitionerIds.map((id) => `Practitioner/${id}`).join(','), _count: ROLE_LOOKUP_LIMIT };
}

// A role without an explicit `active=false` counts as active (optional in FHIR).
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
