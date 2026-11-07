import { clinicDayCode, clinicDaysBetween, clinicInstantMs } from '@medcenter/common';

import type { WeeklyWindowDto } from './dto/create-schedule.dto';

export interface PlannedSlot {
  readonly start: string;
  readonly end: string;
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function splitWindow(day: string, window: WeeklyWindowDto, slotDurationMin: number): PlannedSlot[] {
  const endMin = toMinutes(window.endTime);
  const slots: PlannedSlot[] = [];
  for (let minute = toMinutes(window.startTime); minute + slotDurationMin <= endMin; minute += slotDurationMin) {
    slots.push({
      start: new Date(clinicInstantMs(day, minute)).toISOString(),
      end: new Date(clinicInstantMs(day, minute + slotDurationMin)).toISOString(),
    });
  }
  return slots;
}

/** A window is clinic clock time: `09:00` Monday is 06:00Z in Minsk. Imported by `tools/`. */
export function planSlots(
  fromMs: number,
  toMs: number,
  windows: readonly WeeklyWindowDto[],
  slotDurationMin: number,
): PlannedSlot[] {
  if (!(slotDurationMin > 0)) {
    return [];
  }
  return clinicDaysBetween(fromMs, toMs).flatMap((day) => {
    const code = clinicDayCode(day);
    return windows
      .filter((window) => window.dayOfWeek === code)
      .flatMap((window) => splitWindow(day, window, slotDurationMin));
  });
}
