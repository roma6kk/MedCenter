import { MEDCENTER_EXT } from '@medcenter/terminology';

/**
 * Shared schedule constants. Kept out of the services so `schedules.service`
 * and `slot-generator.service` can both import without a circular dependency.
 *
 * FHIR R4 `Schedule` has no native element for any of these, so each lives in
 * its own extension (absolute URL, one value type per URL).
 */

/** Slot duration in minutes — valueInteger. */
export const SLOT_DURATION_EXT = MEDCENTER_EXT.SCHEDULE_SLOT_DURATION;

/** Weekly working windows — valueString holding the JSON array. */
export const WEEKLY_WINDOWS_EXT = MEDCENTER_EXT.SCHEDULE_WEEKLY_WINDOWS;

/** Planning horizon bounds — valuePeriod. */
export const PLANNING_HORIZON_EXT = MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON;

/** Maximum planning span per generation call (API §5.2.5, FR-020). */
export const PLANNING_HORIZON_DAYS = 90;
