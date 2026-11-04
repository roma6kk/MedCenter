import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';
import { DEFAULT_CONTENT_LANGUAGE, toAppointmentResponseDto, translated, type ContentLanguage } from '@medcenter/fhir-mappers';

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

/**
 * Display form of the first `HumanName`: `text`, else `family given…` (ФИО order). `lang` picks the HL7 `translation`
 * of each part (`_family`, `_given[i]`) or of `text` (`_text`); without a translation the stored Russian value stays.
 */
export function humanNameOf(resource: FhirResource | undefined, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): string | undefined {
  const names = resource?.['name'];
  const first = Array.isArray(names) ? (names[0] as Record<string, unknown> | undefined) : undefined;
  if (first === undefined) {
    return undefined;
  }
  const given = Array.isArray(first['given']) ? (first['given'] as unknown[]) : [];
  const givenElements = Array.isArray(first['_given']) ? (first['_given'] as unknown[]) : [];
  const stored = [first['family'], ...given];
  const localized = [
    nonEmpty(first['family']) ? translated(first['family'], first['_family'], lang) : undefined,
    ...given.map((part, index) => (nonEmpty(part) ? translated(part, givenElements[index], lang) : undefined)),
  ];
  const partsChanged = localized.some((part, index) => part !== undefined && part !== stored[index]);
  if (lang !== DEFAULT_CONTENT_LANGUAGE && partsChanged) {
    return localized.filter(nonEmpty).join(' ');
  }
  if (nonEmpty(first['text'])) {
    return translated(first['text'], first['_text'], lang);
  }
  const parts = stored.filter(nonEmpty);
  return parts.length === 0 ? undefined : parts.join(' ');
}

function lookup(index: ReadonlyMap<string, FhirResource>, type: string, id: string): FhirResource | undefined {
  return id === '' ? undefined : index.get(`${type}/${id}`);
}

/** Read-side DTO: the shared mapper plus names resolved from the included resources. */
export function toAppointmentView(
  appointment: FhirResource,
  included: ReadonlyMap<string, FhirResource>,
  lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
): AppointmentViewDto {
  const base = toAppointmentResponseDto(appointment);
  const role = lookup(included, 'PractitionerRole', base.practitionerRoleId);
  const practitionerRef = parseReference((role?.['practitioner'] as { reference?: unknown } | undefined)?.reference);
  const doctorId = base.doctorId !== '' ? base.doctorId : practitionerRef?.id ?? '';
  const service = lookup(included, 'HealthcareService', base.serviceId);
  const rawServiceName = service?.['name'];
  const serviceName = nonEmpty(rawServiceName) ? translated(rawServiceName, service?.['_name'], lang) : undefined;

  return {
    ...base,
    doctorId,
    doctorName: humanNameOf(lookup(included, 'Practitioner', doctorId), lang),
    serviceName,
    patientName: humanNameOf(lookup(included, 'Patient', base.patientId), lang),
  };
}
