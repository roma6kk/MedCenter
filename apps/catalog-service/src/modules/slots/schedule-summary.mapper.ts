import { Logger } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';

import {
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from '../schedules/schedule.constants';
import type { ScheduleSummaryDto, WeeklyWindowView } from './dto/doctor-schedule-response.dto';

type Extension = Readonly<Record<string, unknown>>;

const logger = new Logger('ScheduleSummary');

const DAYS_OF_WEEK: ReadonlySet<string> = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function findExtension(schedule: FhirResource, url: string): Extension | undefined {
  const extensions = schedule['extension'];
  if (!Array.isArray(extensions)) {
    return undefined;
  }
  return (extensions as readonly Extension[]).find((extension) => extension['url'] === url);
}

/** Id of the first `actor` reference of the given type, e.g. `Location/room-1` → `room-1`. */
function actorId(schedule: FhirResource, resourceType: string): string | undefined {
  const actors = Array.isArray(schedule['actor']) ? (schedule['actor'] as readonly Extension[]) : [];
  const prefix = `${resourceType}/`;
  const reference = actors
    .map((actor) => actor['reference'])
    .find((ref): ref is string => typeof ref === 'string' && ref.startsWith(prefix));
  const id = reference?.slice(prefix.length);
  return id === undefined || id === '' ? undefined : id;
}

function isWeeklyWindow(value: unknown): value is WeeklyWindowView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { dayOfWeek, startTime, endTime } = value as Record<string, unknown>;
  return (
    typeof dayOfWeek === 'string' &&
    DAYS_OF_WEEK.has(dayOfWeek) &&
    typeof startTime === 'string' &&
    HH_MM.test(startTime) &&
    typeof endTime === 'string' &&
    HH_MM.test(endTime)
  );
}

/** Weekly windows are a JSON array inside a valueString; anything unreadable yields no windows. */
function readWindows(schedule: FhirResource): WeeklyWindowView[] {
  const raw = findExtension(schedule, WEEKLY_WINDOWS_EXT)?.['valueString'];
  if (typeof raw !== 'string') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    // A malformed stored value must not fail the whole schedule view, but the
    // doctor would see a schedule without windows, so leave a trace to find it.
    logger.warn(
      { scheduleId: schedule.id, err: error instanceof Error ? error.message : String(error) },
      'Weekly windows of the schedule are not valid JSON; showing none',
    );
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.filter(isWeeklyWindow).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
    : [];
}

function readHorizon(schedule: FhirResource): { readonly start?: unknown; readonly end?: unknown } {
  const period = findExtension(schedule, PLANNING_HORIZON_EXT)?.['valuePeriod'];
  return typeof period === 'object' && period !== null ? (period as Extension) : {};
}

function stringField<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  return typeof value === 'string' && value !== '' ? ({ [key]: value } as Record<K, string>) : {};
}

/** FHIR `Schedule` (with MedCenter extensions) → the doctor-facing summary of API §5.2.7. */
export function toScheduleSummaryDto(schedule: FhirResource): ScheduleSummaryDto {
  const horizon = readHorizon(schedule);
  const duration = findExtension(schedule, SLOT_DURATION_EXT)?.['valueInteger'];
  return {
    id: schedule.id ?? '',
    isActive: schedule['active'] !== false,
    ...stringField('practitionerRoleId', actorId(schedule, 'PractitionerRole')),
    ...stringField('roomId', actorId(schedule, 'Location')),
    ...stringField('serviceId', actorId(schedule, 'HealthcareService')),
    ...stringField('horizonFrom', horizon.start),
    ...stringField('horizonTo', horizon.end),
    ...(typeof duration === 'number' ? { slotDurationMin: duration } : {}),
    windows: readWindows(schedule),
    ...stringField('comment', schedule['comment']),
  };
}
