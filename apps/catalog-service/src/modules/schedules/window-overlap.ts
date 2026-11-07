import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { toMinutes } from './slot-planner';

export function windowsIntersect(a: WeeklyWindowDto, b: WeeklyWindowDto): boolean {
  return (
    a.dayOfWeek === b.dayOfWeek &&
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

export function hasInternalOverlap(windows: readonly WeeklyWindowDto[]): boolean {
  return windows.some((a, index) => windows.slice(index + 1).some((b) => windowsIntersect(a, b)));
}

export function hasCrossOverlap(
  candidate: readonly WeeklyWindowDto[],
  existing: readonly WeeklyWindowDto[],
): boolean {
  return candidate.some((a) => existing.some((b) => windowsIntersect(a, b)));
}
