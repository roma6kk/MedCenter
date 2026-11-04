import type { FhirClient } from '@medcenter/fhir';

/** The resource types that point at a room. */
export type RoomReferrerType = 'Schedule' | 'PractitionerRole' | 'HealthcareService';

/** In the order the delete guard names them: a schedule is the usual reason. */
export const ROOM_REFERRER_TYPES: readonly RoomReferrerType[] = ['Schedule', 'PractitionerRole', 'HealthcareService'];

/**
 * The one definition of "a resource uses this room", shared by the delete
 * guard (API §4.6, `ROOM_IN_USE`) and the usage view (API §4.7) so the two can
 * never disagree.
 *
 * - `Schedule`: catalog-service writes the room as a `Schedule.actor`
 *   (`Location/{id}`), and `actor` is the R4 search parameter over that
 *   element — R4 `Schedule` has no `location` parameter, and HAPI rejects an
 *   unknown one with 400.
 * - `PractitionerRole` and `HealthcareService`: the demo seed lists the rooms of
 *   a doctor and of a service in `location`, the R4 search parameter of both.
 *
 * No `active` filter on purpose: HAPI enforces referential integrity on
 * delete, so a deactivated schedule, role or service still pins its room.
 */
export function roomReferrerQuery(type: RoomReferrerType, roomId: string): Readonly<Record<string, string>> {
  const reference = `Location/${roomId}`;
  return type === 'Schedule' ? { actor: reference } : { location: reference };
}

/**
 * The first type (in {@link ROOM_REFERRER_TYPES} order) of which a resource references the room, `undefined` for a free
 * room. `_count: 1` — one referencing resource is enough to refuse the delete.
 */
export async function firstRoomReferrer(fhirClient: FhirClient, roomId: string): Promise<RoomReferrerType | undefined> {
  const results = await Promise.all(
    ROOM_REFERRER_TYPES.map((type) => fhirClient.search(type, { ...roomReferrerQuery(type, roomId), _count: 1 })),
  );
  return ROOM_REFERRER_TYPES.find((type, index) => (results[index]?.entry ?? []).some((entry) => entry.resource.resourceType === type));
}
