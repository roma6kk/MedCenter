import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';
import { toAppointmentResponseDto } from '@medcenter/fhir-mappers';

import type { AppointmentViewDto } from './dto/appointment-view.dto';
import { parseReference } from './fhir-reference';

/**
 * `_include` parameters that bring every display name into one search Bundle:
 * the actors (Patient, PractitionerRole, HealthcareService) and, one hop
 * further, the Practitioner behind the PractitionerRole.
 */
export const APPOINTMENT_INCLUDES: Readonly<Record<string, string>> = {
  _include: 'Appointment:actor',
  '_include:iterate': 'PractitionerRole:practitioner',
};

/** Search entry as HAPI returns it; `search.mode` is `match` or `include`. */
interface SearchEntry {
  readonly resource?: FhirResource;
  readonly search?: { readonly mode?: unknown };
}

function entriesOf(result: FhirSearchResult): readonly SearchEntry[] {
  return (result.entry ?? []) as readonly SearchEntry[];
}

/** The Appointment matches of a search, without the resources pulled in by `_include`. */
export function appointmentsOf(result: FhirSearchResult): FhirResource[] {
  return entriesOf(result)
    .filter((entry) => entry.search?.mode !== 'include')
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirResource => resource?.resourceType === 'Appointment');
}

/** Every resource of the Bundle keyed by `Type/id`, for resolving participant references. */
export function indexIncluded(result: FhirSearchResult): ReadonlyMap<string, FhirResource> {
  const index = new Map<string, FhirResource>();
  for (const { resource } of entriesOf(result)) {
    if (resource?.id !== undefined) {
      index.set(`${resource.resourceType}/${resource.id}`, resource);
    }
  }
  return index;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Display form of the first `HumanName`: `text`, else `family given…` (ФИО order). */
export function humanNameOf(resource: FhirResource | undefined): string | undefined {
  const names = resource?.['name'];
  const first = Array.isArray(names) ? (names[0] as Record<string, unknown> | undefined) : undefined;
  if (first === undefined) {
    return undefined;
  }
  if (nonEmpty(first['text'])) {
    return first['text'];
  }
  const given = Array.isArray(first['given']) ? (first['given'] as unknown[]) : [];
  const parts = [first['family'], ...given].filter(nonEmpty);
  return parts.length === 0 ? undefined : parts.join(' ');
}

function lookup(index: ReadonlyMap<string, FhirResource>, type: string, id: string): FhirResource | undefined {
  return id === '' ? undefined : index.get(`${type}/${id}`);
}

/** Read-side DTO: the shared mapper plus names resolved from the included resources. */
export function toAppointmentView(appointment: FhirResource, included: ReadonlyMap<string, FhirResource>): AppointmentViewDto {
  const base = toAppointmentResponseDto(appointment);
  const role = lookup(included, 'PractitionerRole', base.practitionerRoleId);
  const practitionerRef = parseReference((role?.['practitioner'] as { reference?: unknown } | undefined)?.reference);
  const doctorId = base.doctorId !== '' ? base.doctorId : practitionerRef?.id ?? '';
  const service = lookup(included, 'HealthcareService', base.serviceId);
  const serviceName = service?.['name'];

  return {
    ...base,
    doctorId,
    doctorName: humanNameOf(lookup(included, 'Practitioner', doctorId)),
    serviceName: nonEmpty(serviceName) ? serviceName : undefined,
    patientName: humanNameOf(lookup(included, 'Patient', base.patientId)),
  };
}
