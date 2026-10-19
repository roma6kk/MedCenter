/** room-schema — the room (Location) form, limits of `CreateRoomDto` (api-designer-spec §4.4). Messages are message KEYS. */
import { z } from 'zod';
import type { AdminRoom, RoomPayload } from './room-types';

export const FLOOR_MIN = 1;
export const FLOOR_MAX = 10;

function isFloorInRange(value: string): boolean {
  if (value === '') return true;
  const floor = Number(value);
  return /^\d+$/.test(value) && floor >= FLOOR_MIN && floor <= FLOOR_MAX;
}

export const roomSchema = z.object({
  identifier: z.string().trim().min(1, 'validation.required').max(50, 'validation.tooLong'),
  name: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  floor: z.string().refine(isFloorInRange, 'admin.rooms.validation.floor'),
  description: z.string().max(500, 'validation.tooLong'),
});

export type RoomFormValues = z.infer<typeof roomSchema>;

export const EMPTY_ROOM_VALUES: RoomFormValues = { identifier: '', name: '', floor: '', description: '' };

export function roomValuesOf(room: AdminRoom): RoomFormValues {
  return { identifier: room.identifier, name: room.name, floor: room.floor === undefined ? '' : String(room.floor), description: room.description ?? '' };
}

/** The body of `POST`/`PATCH /admin/rooms`. An edit always sends the description (an empty one clears it). */
export function toRoomPayload(values: RoomFormValues, isEdit: boolean): RoomPayload {
  return {
    identifier: values.identifier.trim(),
    name: values.name.trim(),
    ...(values.floor === '' ? {} : { floor: Number(values.floor) }),
    ...(values.description === '' && !isEdit ? {} : { description: values.description }),
  };
}
