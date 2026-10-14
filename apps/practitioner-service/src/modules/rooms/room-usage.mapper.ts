import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto } from '@medcenter/fhir-mappers';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { formatHorizonDate, formatSlotPeriod } from './clinic-time';
import type { RoomUsageReferenceDto } from './dto/room-usage-response.dto';

type Json = Readonly<Record<string, unknown>>;

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

function practitionerName(role: FhirResource | undefined, index: ResourceIndex): string | undefined {
  const reference = referenceOf(role?.['practitioner']);
  const practitioner = reference === undefined ? undefined : index.get(reference);
  if (practitioner === undefined) {
    return undefined;
  }
  const { firstName, lastName } = toDoctorResponseDto(practitioner);
  const name = `${lastName} ${firstName}`.trim();
  return name === '' ? undefined : name;
}

/** Doctor of a schedule: the practitioner's name, else the bare role reference. */
export function scheduleDoctorLabel(schedule: FhirResource, index: ResourceIndex): string | undefined {
  const roleReference = actorReference(schedule, 'PractitionerRole');
  if (roleReference === undefined) {
    return undefined;
  }
  return practitionerName(index.get(roleReference), index) ?? roleReference;
}

/** Schedule id → doctor label, for naming the doctor on each booked slot line. */
export function doctorsBySchedule(schedules: readonly FhirResource[], index: ResourceIndex): ReadonlyMap<string, string> {
  const doctors = new Map<string, string>();
  for (const schedule of schedules) {
    const doctor = scheduleDoctorLabel(schedule, index);
    if (schedule.id !== undefined && doctor !== undefined) {
      doctors.set(schedule.id, doctor);
    }
  }
  return doctors;
}

function serviceName(schedule: FhirResource, index: ResourceIndex): string | undefined {
  const reference = actorReference(schedule, 'HealthcareService');
  const name = reference === undefined ? undefined : index.get(reference)?.['name'];
  return typeof name === 'string' && name !== '' ? name : undefined;
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

/** `Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026 · активно`. */
export function toScheduleUsage(schedule: FhirResource, index: ResourceIndex): RoomUsageReferenceDto {
  const isActive = schedule['active'] !== false;
  return {
    resourceType: 'Schedule',
    id: schedule.id ?? '',
    isActive,
    display: joinDefined([
      scheduleDoctorLabel(schedule, index),
      serviceName(schedule, index),
      horizonText(schedule),
      isActive ? 'активно' : 'неактивно',
    ]),
  };
}

/** `02.11.2026 12:00–12:30 · запись · Иванов Иван` — a busy slot is a booked appointment. */
export function toSlotUsage(slot: FhirResource, doctorBySchedule: ReadonlyMap<string, string>): RoomUsageReferenceDto {
  const start = typeof slot['start'] === 'string' ? slot['start'] : '';
  const end = typeof slot['end'] === 'string' ? slot['end'] : '';
  const scheduleId = referenceOf(slot['schedule'])?.replace(/^Schedule\//, '') ?? '';
  return {
    resourceType: 'Slot',
    id: slot.id ?? '',
    scheduleId,
    start,
    end,
    display: joinDefined([formatSlotPeriod(start, end), 'запись', doctorBySchedule.get(scheduleId)]),
  };
}
