import type { FhirResource } from '@medcenter/fhir';

/** Form in which two room identifiers are compared: `204-Х`, ` 204-х ` and `204-Х` name the same door. */
export function identifierKey(value: string): string {
  return value.trim().toLowerCase();
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

/** FHIR token value in a search URL: `\`, `$`, `,` and `|` are escaped with a backslash, then the value is URL-encoded. */
function tokenParameter(value: string): string {
  return encodeURIComponent(value.replace(/[\\$,|]/g, (character) => `\\${character}`));
}

/**
 * Match URL of the room create (a FHIR conditional update): HAPI stores the room only when no `Location` with
 * this exact identifier exists, in the same step that checks it, and refuses the whole transaction otherwise.
 * That closes the window between the read of `assertIdentifierFree` and the write for two concurrent creates of
 * one identifier. (A variant that differs only in case or padding is still refused by the read check, one
 * request at a time.)
 */
export function roomIdentifierQuery(identifier: string): string {
  return `Location?identifier=${tokenParameter(identifier)}`;
}
