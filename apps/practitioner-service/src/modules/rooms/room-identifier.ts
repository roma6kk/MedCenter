import type { FhirResource } from '@medcenter/fhir';

export function identifierKey(value: string): string {
  return value.trim().toLowerCase();
}

export function identifierValuesOf(room: FhirResource): string[] {
  const identifiers: readonly unknown[] = Array.isArray(room['identifier']) ? room['identifier'] : [];
  return identifiers.flatMap((identifier) => {
    const { value } = (identifier ?? {}) as { value?: unknown };
    return typeof value === 'string' ? [value] : [];
  });
}

export function roomUsingIdentifier(rooms: readonly FhirResource[], identifier: string, exceptRoomId?: string): FhirResource | undefined {
  const wanted = identifierKey(identifier);
  return rooms.find((room) => room.id !== exceptRoomId && identifierValuesOf(room).some((value) => identifierKey(value) === wanted));
}

function tokenParameter(value: string): string {
  return encodeURIComponent(value.replace(/[\\$,|]/g, (character) => `\\${character}`));
}

// Conditional create: HAPI stores the room only if no Location has this identifier, closing the race of two concurrent creates.
export function roomIdentifierQuery(identifier: string): string {
  return `Location?identifier=${tokenParameter(identifier)}`;
}
