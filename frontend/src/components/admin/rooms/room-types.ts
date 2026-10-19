/** `RoomResponseDto` of `GET /api/v1/rooms` (api-designer-spec §4). */
export interface AdminRoom {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number;
  readonly description?: string;
  readonly isActive: boolean;
}

/** `CreateRoomDto` / `UpdateRoomDto` body. */
export interface RoomPayload {
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number;
  readonly description?: string;
}

/** One `Schedule`/`Slot` that holds the room (`GET /admin/rooms/{id}/usage`, api-designer-spec §4.7). */
export interface RoomUsageReference {
  readonly resourceType: 'Schedule' | 'Slot';
  readonly id: string;
  readonly display: string;
  readonly isActive?: boolean;
}

export interface RoomUsage {
  readonly roomId?: string;
  /** `true` exactly when `DELETE` would answer 409 `ROOM_IN_USE`. */
  readonly inUse?: boolean;
  /** More upcoming bookings exist than the answer lists. */
  readonly truncated?: boolean;
  readonly items: ReadonlyArray<RoomUsageReference>;
}
