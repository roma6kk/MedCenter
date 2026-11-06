import { formatSlotPeriod } from '@medcenter/common';
import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto, translated, type ContentLanguage } from '@medcenter/fhir-mappers';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { formatHorizonDate } from './clinic-time';
import type { RoomUsageReferenceDto } from './dto/room-usage-response.dto';

type Json = Readonly<Record<string, unknown>>;

const BOOKING_WORD: Readonly<Record<ContentLanguage, string>> = { ru: 'запись', en: 'booking' };

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

export function scheduleDoctorLabel(schedule: FhirResource, index: ResourceIndex, lang: ContentLanguage): string | undefined {
  const roleReference = actorReference(schedule, 'PractitionerRole');
  if (roleReference === undefined) {
    return undefined;
  }
  return practitionerName(index.get(roleReference), index, lang) ?? roleReference;
}

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

export function toRoleUsage(role: FhirResource, index: ResourceIndex, lang: ContentLanguage): RoomUsageReferenceDto {
  const id = role.id ?? '';
  return {
    resourceType: 'PractitionerRole',
    id,
    isActive: role['active'] !== false,
    display: practitionerName(role, index, lang) ?? `PractitionerRole/${id}`,
  };
}

export function toServiceUsage(service: FhirResource, lang: ContentLanguage): RoomUsageReferenceDto {
  const id = service.id ?? '';
  return {
    resourceType: 'HealthcareService',
    id,
    isActive: service['active'] !== false,
    display: serviceName(service, lang) ?? `HealthcareService/${id}`,
  };
}

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
