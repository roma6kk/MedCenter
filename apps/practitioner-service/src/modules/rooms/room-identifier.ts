import type { FhirResource } from '@medcenter/fhir';

/** Form in which two room identifiers are compared: `204-Х`, ` 204-х ` and `204-Х` name the same door. */
export function identifierKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Every `Location.identifier[].value` of a room. */
export function identifierValuesOf(room: FhirResource): string[] {
  const identifiers: readonly unknown[] = Array.isArray(room['identifier']) ? room['identifier'] : [];
  return identifiers.flatMap((identifier) => {
    const { value } = (identifier ?? {}) as { value?: unknown };
    return typeof value === 'string' ? [value] : [];
  });
}

/**
 * The room (other than `exceptRoomId`, the one being renamed) that already carries `identifier`,
 * or `undefined` when it is free (API §4.4: `Location.identifier` of a room is unique).
 */
export function roomUsingIdentifier(rooms: readonly FhirResource[], identifier: string, exceptRoomId?: string): FhirResource | undefined {
  const wanted = identifierKey(identifier);
  return rooms.find((room) => room.id !== exceptRoomId && identifierValuesOf(room).some((value) => identifierKey(value) === wanted));
}
