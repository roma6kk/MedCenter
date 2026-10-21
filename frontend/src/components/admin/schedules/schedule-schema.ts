/**
 * schedule-schema — the schedule editor form with the limits of `CreateScheduleDto` / `UpdateScheduleDto`
 * (api-designer-spec §5.2.1/§5.2.3): FHIR ids of the three actors, horizon ≤ 90 days, windows `HH:mm` with end > start
 * and no overlap, slot duration 5…120 min. Messages are message KEYS (`useFormMessage`).
 */
import { z } from 'zod';
import { isCalendarDate } from '@/lib/contracts';
import { clinicDateKey, daysBetween, shiftDateKey } from '@/lib/clinic-time';
import { MAX_HORIZON_DAYS, findOverlappingWindows, isWindowValid, sortWindows } from './schedule-windows';
import type { AdminSchedule, CreateSchedulePayload, UpdateSchedulePayload, WeekDay, WeeklyWindow } from './schedule-types';
import { WEEK_DAYS } from './schedule-types';
import { FHIR_ID_PATTERN } from '../shared/fhir-id';

export const SLOT_DURATION_MIN = 5;
export const SLOT_DURATION_MAX = 120;
export const DEFAULT_HORIZON_DAYS = 30;

const windowSchema = z.object({
  dayOfWeek: z.enum(WEEK_DAYS),
  startTime: z.string(),
  endTime: z.string(),
});

function isFhirId(value: string): boolean {
  return FHIR_ID_PATTERN.test(value);
}

function isDurationValid(value: string): boolean {
  const minutes = Number(value);
  return /^\d+$/.test(value) && minutes >= SLOT_DURATION_MIN && minutes <= SLOT_DURATION_MAX;
}

const editableShape = {
  horizonFrom: z.string().refine(isCalendarDate, 'validation.date'),
  horizonTo: z.string().refine(isCalendarDate, 'validation.date'),
  slotDurationMin: z.string().refine(isDurationValid, 'admin.schedules.validation.duration'),
  comment: z.string().max(500, 'validation.tooLong'),
  windows: z.array(windowSchema).min(1, 'admin.schedules.validation.windowsRequired'),
};

const actorsShape = {
  practitionerRoleId: z.string(),
  roomId: z.string(),
  serviceId: z.string(),
};

const scheduleShape = { ...actorsShape, ...editableShape };

interface EditableValues {
  readonly horizonFrom: string;
  readonly horizonTo: string;
  readonly windows: ReadonlyArray<WeeklyWindow>;
}

interface ActorValues {
  readonly practitionerRoleId: string;
  readonly roomId: string;
  readonly serviceId: string;
}

/** The three actors are chosen once, when the schedule is created; the server does not let them change afterwards. */
function checkActors(values: ActorValues, ctx: z.RefinementCtx): void {
  const required: ReadonlyArray<readonly [keyof ActorValues, string]> = [
    ['practitionerRoleId', 'admin.schedules.validation.doctorRequired'],
    ['roomId', 'admin.schedules.validation.roomRequired'],
    ['serviceId', 'admin.schedules.validation.serviceRequired'],
  ];
  required.forEach(([field, message]) => {
    if (!isFhirId(values[field])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  });
}

function checkHorizon(values: EditableValues, ctx: z.RefinementCtx): void {
  if (!isCalendarDate(values.horizonFrom) || !isCalendarDate(values.horizonTo)) return;
  const span: number = daysBetween(values.horizonFrom, values.horizonTo);
  if (span < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horizonTo'], message: 'admin.schedules.validation.horizonOrder' });
  else if (span > MAX_HORIZON_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horizonTo'], message: 'admin.schedules.validation.horizonSpan' });
}

function checkWindows(values: EditableValues, ctx: z.RefinementCtx): void {
  values.windows.forEach((window, index) => {
    if (!isWindowValid(window)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['windows', index, 'endTime'], message: 'admin.schedules.validation.windowTimes' });
  });
  if (findOverlappingWindows(values.windows).size > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['windows'], message: 'admin.schedules.validation.windowsOverlap' });
  }
}

function checkEditable(values: EditableValues, ctx: z.RefinementCtx): void {
  checkHorizon(values, ctx);
  checkWindows(values, ctx);
}

export type ScheduleMode = 'create' | 'edit';

/** One form type for both modes: an edit carries the (read-only) actors of the schedule and skips their validation. */
export function scheduleSchemaFor(mode: ScheduleMode): z.ZodEffects<z.ZodObject<typeof scheduleShape>> {
  return z.object(scheduleShape).superRefine((values, ctx) => {
    if (mode === 'create') checkActors(values, ctx);
    checkEditable(values, ctx);
  });
}

export type ScheduleFormValues = z.infer<ReturnType<typeof scheduleSchemaFor>>;

export const DEFAULT_WINDOW: WeeklyWindow = { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' };

export function emptyScheduleValues(now: Date = new Date()): ScheduleFormValues {
  const from: string = clinicDateKey(now);
  return {
    practitionerRoleId: '',
    roomId: '',
    serviceId: '',
    horizonFrom: from,
    horizonTo: shiftDateKey(from, DEFAULT_HORIZON_DAYS),
    slotDurationMin: '30',
    comment: '',
    windows: [DEFAULT_WINDOW],
  };
}

export function scheduleValuesOf(schedule: AdminSchedule): ScheduleFormValues {
  return {
    practitionerRoleId: schedule.practitionerRoleId ?? '',
    roomId: schedule.roomId ?? '',
    serviceId: schedule.serviceId ?? '',
    horizonFrom: schedule.horizonFrom ?? clinicDateKey(),
    horizonTo: schedule.horizonTo ?? shiftDateKey(clinicDateKey(), DEFAULT_HORIZON_DAYS),
    slotDurationMin: String(schedule.slotDurationMin ?? 30),
    comment: schedule.comment ?? '',
    windows: schedule.windows.length > 0 ? schedule.windows.map((window) => ({ ...window })) : [DEFAULT_WINDOW],
  };
}

function cleanWindows(windows: ReadonlyArray<WeeklyWindow>): ReadonlyArray<WeeklyWindow> {
  return sortWindows(windows).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek: dayOfWeek as WeekDay, startTime, endTime }));
}

/** The body of `POST /admin/schedules`; an empty comment is left out. */
export function toCreateSchedulePayload(values: ScheduleFormValues): CreateSchedulePayload {
  return {
    practitionerRoleId: values.practitionerRoleId,
    roomId: values.roomId,
    serviceId: values.serviceId,
    horizonFrom: values.horizonFrom,
    horizonTo: values.horizonTo,
    windows: cleanWindows(values.windows),
    slotDurationMin: Number(values.slotDurationMin),
    ...(values.comment.trim() === '' ? {} : { comment: values.comment.trim() }),
  };
}

/**
 * The body of `PATCH /admin/schedules/{id}`. The comment is always sent: the server changes it only when it is present, so
 * leaving an emptied comment out would silently keep the old text (rooms and services send their description the same way).
 */
export function toUpdateSchedulePayload(values: ScheduleFormValues): UpdateSchedulePayload {
  return {
    horizonFrom: values.horizonFrom,
    horizonTo: values.horizonTo,
    windows: cleanWindows(values.windows),
    slotDurationMin: Number(values.slotDurationMin),
    comment: values.comment.trim(),
  };
}
