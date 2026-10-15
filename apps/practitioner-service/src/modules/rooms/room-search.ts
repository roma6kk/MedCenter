import type { FhirClient, FhirResource } from '@medcenter/fhir';

/** `Location.physicalType` code system and the code that marks a room. */
export const LOCATION_PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';
export const ROOM_PHYSICAL_TYPE_CODE = 'ro';

/** HAPI page size of one scan step, and the most Locations a single listing reads. */
export const LOCATION_SCAN_CHUNK = 100;
export const LOCATION_SCAN_LIMIT = 1_000;

/** `true` when a `Location` carries the `ro` (room) coding of the HL7 physical-type system. */
export function isRoom(location: FhirResource): boolean {
  const { physicalType } = location as { physicalType?: { coding?: unknown } };
  const codings: readonly unknown[] = Array.isArray(physicalType?.coding) ? physicalType.coding : [];
  return codings.some((coding) => {
    const { system, code } = coding as { system?: unknown; code?: unknown };
    return system === LOCATION_PHYSICAL_TYPE_SYSTEM && code === ROOM_PHYSICAL_TYPE_CODE;
  });
}

/**
 * Every room, in HAPI order.
 *
 * R4 defines no `Location` search parameter over `physicalType` (HAPI answers
 * `Location?physical-type=` with 400 HAPI-0524), so the rooms are told apart
 * from other Locations here. Paging and the §0 total must count rooms, not all
 * Locations (a building in between would shorten a page and inflate the total),
 * so the Locations are read in chunks until HAPI runs out. The read is bounded
 * by {@link LOCATION_SCAN_LIMIT}: a clinic has far fewer Locations, and the
 * bound keeps a request from walking an unexpectedly large store.
 */
export async function findAllRooms(fhirClient: FhirClient): Promise<FhirResource[]> {
  const rooms: FhirResource[] = [];
  for (let scanned = 0; scanned < LOCATION_SCAN_LIMIT; scanned += LOCATION_SCAN_CHUNK) {
    const result = await fhirClient.search('Location', { _count: LOCATION_SCAN_CHUNK, _offset: scanned });
    const chunk = (result.entry ?? []).map((entry) => entry.resource);
    rooms.push(...chunk.filter(isRoom));
    if (chunk.length < LOCATION_SCAN_CHUNK) {
      break;
    }
  }
  return rooms;
}
