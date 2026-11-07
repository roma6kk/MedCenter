import type { FhirClient } from '@medcenter/fhir';

export type RoomReferrerType = 'Schedule' | 'PractitionerRole' | 'HealthcareService';

export const ROOM_REFERRER_TYPES: readonly RoomReferrerType[] = ['Schedule', 'PractitionerRole', 'HealthcareService'];

// Shared by the delete guard and the usage view. R4 Schedule has no `location` param (HAPI 400), so a room is its `actor`. No `active` filter: inactive ones still pin the room.
export function roomReferrerQuery(type: RoomReferrerType, roomId: string): Readonly<Record<string, string>> {
  const reference = `Location/${roomId}`;
  return type === 'Schedule' ? { actor: reference } : { location: reference };
}

export async function firstRoomReferrer(fhirClient: FhirClient, roomId: string): Promise<RoomReferrerType | undefined> {
  const results = await Promise.all(
    ROOM_REFERRER_TYPES.map((type) => fhirClient.search(type, { ...roomReferrerQuery(type, roomId), _count: 1 })),
  );
  return ROOM_REFERRER_TYPES.find((type, index) => (results[index]?.entry ?? []).some((entry) => entry.resource.resourceType === type));
}
