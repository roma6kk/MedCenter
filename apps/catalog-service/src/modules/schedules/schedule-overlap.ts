import { ConflictException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { searchPages } from '../../common/fhir-search';
import { toScheduleSummaryDto } from '../slots/schedule-summary.mapper';
import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { hasCrossOverlap, hasInternalOverlap } from './window-overlap';

/** Inclusive planning horizon of a schedule; a missing bound is open-ended. */
export interface Horizon {
  readonly start?: string;
  readonly end?: string;
}

export interface OverlapCandidate {
  readonly practitionerRoleId: string;
  readonly windows: readonly WeeklyWindowDto[];
  readonly horizon: Horizon;
  /** The schedule being edited: it does not conflict with itself. */
  readonly excludeScheduleId?: string;
}

function boundOf(value: string | undefined, open: number): number {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : open;
}

/** Two inclusive ranges share at least one day (an unreadable or missing bound counts as open). */
export function horizonsIntersect(a: Horizon, b: Horizon): boolean {
  return (
    boundOf(a.start, Number.NEGATIVE_INFINITY) <= boundOf(b.end, Number.POSITIVE_INFINITY) &&
    boundOf(b.start, Number.NEGATIVE_INFINITY) <= boundOf(a.end, Number.POSITIVE_INFINITY)
  );
}

function overlap(message: string): ConflictException {
  return new ConflictException({ errorCode: 'SCHEDULE_OVERLAP', message: `SCHEDULE_OVERLAP: ${message}` });
}

/**
 * BR-007 / API §1 `SCHEDULE_OVERLAP`: the same practitioner role cannot work two
 * schedules whose planning horizons intersect AND whose weekly windows share a
 * weekday and a time range. Disjoint horizons may reuse the same hours (next
 * quarter's schedule), disjoint hours may share a horizon (morning/afternoon).
 */
export async function assertNoScheduleOverlap(fhirClient: FhirClient, candidate: OverlapCandidate): Promise<void> {
  if (hasInternalOverlap(candidate.windows)) {
    throw overlap('weekly windows intersect');
  }
  const { resources } = await searchPages(fhirClient, 'Schedule', {
    actor: `PractitionerRole/${candidate.practitionerRoleId}`,
    active: 'true',
    _sort: '_id',
  });
  const conflicting = resources.some((schedule: FhirResource) => {
    if (schedule.id === candidate.excludeScheduleId) {
      return false;
    }
    const existing = toScheduleSummaryDto(schedule);
    const horizon: Horizon = { start: existing.horizonFrom, end: existing.horizonTo };
    return horizonsIntersect(candidate.horizon, horizon) && hasCrossOverlap(candidate.windows, existing.windows);
  });
  if (conflicting) {
    throw overlap(`practitioner role ${candidate.practitionerRoleId} already has a schedule in this period`);
  }
}
