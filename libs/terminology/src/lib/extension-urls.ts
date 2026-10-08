/**
 * Canonical URLs of MedCenter's own FHIR extensions.
 *
 * FHIR R4 `Extension.url` identifies the StructureDefinition of the extension
 * and must be an absolute URL — bare names such as `floor` are rejected by a
 * validating HAPI. Every service reads and writes extensions only through
 * these constants so a URL never drifts between the writer and the reader.
 */
const EXTENSION_BASE = 'https://api.medcenter.by/fhir/StructureDefinition';

export const MEDCENTER_EXT = {
  /** `Location` (room) floor — valueInteger. */
  ROOM_FLOOR: `${EXTENSION_BASE}/room-floor`,
  /** `HealthcareService` default visit duration in minutes — valueInteger. */
  SERVICE_DEFAULT_DURATION: `${EXTENSION_BASE}/service-default-duration`,
  /** `Schedule` slot duration in minutes — valueInteger. */
  SCHEDULE_SLOT_DURATION: `${EXTENSION_BASE}/schedule-slot-duration`,
  /** `Schedule` weekly working windows — valueString (JSON array). */
  SCHEDULE_WEEKLY_WINDOWS: `${EXTENSION_BASE}/schedule-weekly-windows`,
  /** `Schedule` planning horizon — valuePeriod. */
  SCHEDULE_PLANNING_HORIZON: `${EXTENSION_BASE}/schedule-planning-horizon`,
  /** `Slot` copy of the schedule actors — valueString (JSON array). */
  SLOT_ACTORS: `${EXTENSION_BASE}/slot-actors`,
} as const;
