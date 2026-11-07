import { HttpStatus } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

export const LOCATION_PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';
export const ROOM_PHYSICAL_TYPE_CODE = 'ro';

export const LOCATION_SCAN_CHUNK = 100;
export const LOCATION_SCAN_LIMIT = 1_000;

export function isRoom(location: FhirResource): boolean {
  const { physicalType } = location as { physicalType?: { coding?: unknown } };
  const codings: readonly unknown[] = Array.isArray(physicalType?.coding) ? physicalType.coding : [];
  return codings.some((coding) => {
    const { system, code } = coding as { system?: unknown; code?: unknown };
    return system === LOCATION_PHYSICAL_TYPE_SYSTEM && code === ROOM_PHYSICAL_TYPE_CODE;
  });
}

// Another Location (building, ward) is 404 NOT_FOUND: an admin write must not turn it into a room or delete it.
export async function readRoom(fhirClient: FhirClient, id: string): Promise<FhirResource> {
  const location = await fhirClient.read('Location', id);
  if (!isRoom(location)) {
    throw new FhirClientError('GET', `Location/${id}`, HttpStatus.NOT_FOUND);
  }
  return location;
}

// R4 has no Location search over `physicalType` (HAPI-0524), so rooms are filtered here, read in chunks up to LOCATION_SCAN_LIMIT.
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
