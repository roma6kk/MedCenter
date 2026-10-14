import { clinicDayCode, clinicDaysBetween, clinicInstantMs } from '../../common/clinic-calendar';
import type { WeeklyWindowDto } from './dto/create-schedule.dto';

/** One slot an expanded weekly window yields, as UTC ISO instants. */
export interface PlannedSlot {
  readonly start: string;
  readonly end: string;
}

/** Minutes after midnight of an `HH:mm` clock time. */
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

/**
 * Expands weekly windows into slots for every clinic day between `fromMs` and
 * `toMs` (inclusive). A window is a *clinic* clock time: `09:00` on a Monday is
 * 09:00 in Minsk, i.e. 06:00Z, and the weekday is the clinic weekday — the same
 * zone the doctor and patient screens label slots in. API §5.2.1 does not name
 * the zone (pending a spec update); `tools/demo-seed` follows this reading, so
 * the seed and this planner agree on every slot instant.
 */
export function planSlots(
  fromMs: number,
  toMs: number,
  windows: readonly WeeklyWindowDto[],
  slotDurationMin: number,
): PlannedSlot[] {
  // A non-positive duration would never advance the loop.
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
