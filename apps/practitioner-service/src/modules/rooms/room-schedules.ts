/**
 * The one definition of "a schedule uses this room", shared by the delete
 * guard (API §4.6, `ROOM_IN_USE`) and the usage view (API §4.7) so the two can
 * never disagree.
 *
 * catalog-service writes the room as a `Schedule.actor` (`Location/{id}`), and
 * `actor` is the R4 search parameter over that element — R4 `Schedule` has no
 * `location` parameter, and HAPI rejects an unknown one with 400.
 *
 * No `active` filter on purpose: HAPI enforces referential integrity on
 * delete, so a deactivated schedule still pins its room.
 */
export function roomScheduleQuery(roomId: string): Readonly<Record<string, string>> {
  return { actor: `Location/${roomId}` };
}
