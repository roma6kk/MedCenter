import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto, translated, type ContentLanguage } from '@medcenter/fhir-mappers';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { formatHorizonDate, formatSlotPeriod } from './clinic-time';
import type { RoomUsageReferenceDto } from './dto/room-usage-response.dto';

type Json = Readonly<Record<string, unknown>>;

/**
 * The one word the lines of this view say themselves, in the language of `Accept-Language`: a busy slot is a booked
 * appointment. Names and service titles come from the data in the same language; whether a schedule, role or service is
 * active is `isActive`, which the client words itself, so no line repeats it.
 */
const BOOKING_WORD: Readonly<Record<ContentLanguage, string>> = { ru: 'запись', en: 'booking' };

/** Resources of a search Bundle (matches and `_include`s) keyed by `Type/id`. */
export type ResourceIndex = ReadonlyMap<string, FhirResource>;

export function indexByReference(resources: readonly FhirResource[]): ResourceIndex {
  return new Map(
    resources
      .filter((resource) => resource.id !== undefined && resource.id !== '')
      .map((resource) => [`${resource.resourceType}/${resource.id}`, resource]),
  );
}

function referenceOf(value: unknown): string | undefined {
  const reference = typeof value === 'object' && value !== null ? (value as Json)['reference'] : undefined;
  return typeof reference === 'string' && reference !== '' ? reference : undefined;
}

/** First `Schedule.actor` reference of the given type, e.g. `PractitionerRole/role-7`. */
function actorReference(schedule: FhirResource, resourceType: string): string | undefined {
  const actors: readonly unknown[] = Array.isArray(schedule['actor']) ? schedule['actor'] : [];
  return actors.map(referenceOf).find((reference) => reference?.startsWith(`${resourceType}/`));
}

function practitionerName(role: FhirResource | undefined, index: ResourceIndex, lang: ContentLanguage): string | undefined {
  const reference = referenceOf(role?.['practitioner']);
  const practitioner = reference === undefined ? undefined : index.get(reference);
  if (practitioner === undefined) {
    return undefined;
  }
  const { firstName, lastName } = toDoctorResponseDto(practitioner, lang);
  const name = `${lastName} ${firstName}`.trim();
  return name === '' ? undefined : name;
}

/** Doctor of a schedule: the practitioner's name, else the bare role reference. */
export function scheduleDoctorLabel(schedule: FhirResource, index: ResourceIndex, lang: ContentLanguage): string | undefined {
  const roleReference = actorReference(schedule, 'PractitionerRole');
  if (roleReference === undefined) {
    return undefined;
  }
  return practitionerName(index.get(roleReference), index, lang) ?? roleReference;
}

/** Schedule id → doctor label, for naming the doctor on each booked slot line. */
export function doctorsBySchedule(
  schedules: readonly FhirResource[],
  index: ResourceIndex,
  lang: ContentLanguage,
): ReadonlyMap<string, string> {
  const doctors = new Map<string, string>();
  for (const schedule of schedules) {
    const doctor = scheduleDoctorLabel(schedule, index, lang);
    if (schedule.id !== undefined && doctor !== undefined) {
      doctors.set(schedule.id, doctor);
    }
  }
  return doctors;
}

/** The title of a `HealthcareService` in `lang`; the stored (Russian) one when it has no translation. */
function serviceName(service: FhirResource | undefined, lang: ContentLanguage): string | undefined {
  const name = service?.['name'];
  const title = typeof name === 'string' ? translated(name, service?.['_name'], lang) : '';
  return title === '' ? undefined : title;
}

function scheduleServiceName(schedule: FhirResource, index: ResourceIndex, lang: ContentLanguage): string | undefined {
  const reference = actorReference(schedule, 'HealthcareService');
  return serviceName(reference === undefined ? undefined : index.get(reference), lang);
}

function horizonText(schedule: FhirResource): string | undefined {
  const extensions: readonly unknown[] = Array.isArray(schedule['extension']) ? schedule['extension'] : [];
  const horizon = extensions.find(
    (extension): extension is Json =>
      typeof extension === 'object' &&
      extension !== null &&
      (extension as Json)['url'] === MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON,
  );
  const period = horizon?.['valuePeriod'];
  if (typeof period !== 'object' || period === null) {
    return undefined;
  }
  const start = formatHorizonDate((period as Json)['start']);
  const end = formatHorizonDate((period as Json)['end']);
  return start === undefined || end === undefined ? undefined : `${start}–${end}`;
}

function joinDefined(parts: ReadonlyArray<string | undefined>): string {
  return parts.filter((part): part is string => part !== undefined).join(' · ');
}

/** `Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026`; the bare reference when nothing names the schedule. */
export function toScheduleUsage(schedule: FhirResource, index: ResourceIndex, lang: ContentLanguage): RoomUsageReferenceDto {
  const id = schedule.id ?? '';
  const line = joinDefined([scheduleDoctorLabel(schedule, index, lang), scheduleServiceName(schedule, index, lang), horizonText(schedule)]);
  return {
    resourceType: 'Schedule',
    id,
    isActive: schedule['active'] !== false,
    display: line === '' ? `Schedule/${id}` : line,
  };
}

/** `Иванов Иван` — a doctor whose role lists the room among its places of work. */
export function toRoleUsage(role: FhirResource, index: ResourceIndex, lang: ContentLanguage): RoomUsageReferenceDto {
  const id = role.id ?? '';
  return {
    resourceType: 'PractitionerRole',
    id,
    isActive: role['active'] !== false,
    display: practitionerName(role, index, lang) ?? `PractitionerRole/${id}`,
  };
}

/** `Консультация терапевта` — a service whose `location` lists the room. */
export function toServiceUsage(service: FhirResource, lang: ContentLanguage): RoomUsageReferenceDto {
  const id = service.id ?? '';
  return {
    resourceType: 'HealthcareService',
    id,
    isActive: service['active'] !== false,
    display: serviceName(service, lang) ?? `HealthcareService/${id}`,
  };
}

/** `02.11.2026 12:00–12:30 · запись · Иванов Иван` — a busy slot is a booked appointment. */
export function toSlotUsage(
  slot: FhirResource,
  doctorBySchedule: ReadonlyMap<string, string>,
  lang: ContentLanguage,
): RoomUsageReferenceDto {
  const start = typeof slot['start'] === 'string' ? slot['start'] : '';
  const end = typeof slot['end'] === 'string' ? slot['end'] : '';
  const scheduleId = referenceOf(slot['schedule'])?.replace(/^Schedule\//, '') ?? '';
  return {
    resourceType: 'Slot',
    id: slot.id ?? '',
    scheduleId,
    start,
    end,
    display: joinDefined([formatSlotPeriod(start, end), BOOKING_WORD[lang], doctorBySchedule.get(scheduleId)]),
  };
}
