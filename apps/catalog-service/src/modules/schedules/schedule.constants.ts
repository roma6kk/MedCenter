import { MEDCENTER_EXT } from '@medcenter/terminology';

/** FHIR R4 `Schedule` has no native slot duration or horizon elements, so they ride in extensions. Kept out of the services to avoid a circular import. */

export const SLOT_DURATION_EXT = MEDCENTER_EXT.SCHEDULE_SLOT_DURATION;

export const WEEKLY_WINDOWS_EXT = MEDCENTER_EXT.SCHEDULE_WEEKLY_WINDOWS;

export const PLANNING_HORIZON_EXT = MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON;

export const PLANNING_HORIZON_DAYS = 90;
