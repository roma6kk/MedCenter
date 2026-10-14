/**
 * One resource that uses the room (API §4.7). The frontend `RoomUsageDrawer`
 * renders `resourceType`, `id` and `display`; the remaining fields are
 * additive detail for API clients.
 */
export interface RoomUsageReferenceDto {
  readonly resourceType: 'Schedule' | 'Slot';
  readonly id: string;
  /** Human-readable line in clinic time (Europe/Minsk), Russian UI wording. */
  readonly display: string;
  /** `Schedule` only: `false` for a deactivated schedule that still pins the room. */
  readonly isActive?: boolean;
  /** `Slot` only: owning schedule and the booked period. */
  readonly scheduleId?: string;
  readonly start?: string;
  readonly end?: string;
}

/**
 * API §4.7 response. `items` lists every `Schedule` that references the room
 * first, then its upcoming booked (`busy`) `Slot`s sorted by `start` — a
 * booked appointment holds its slot busy (ADR-012), so these are the room's
 * upcoming appointments.
 */
export interface RoomUsageResponseDto {
  readonly roomId: string;
  /** `true` exactly when `DELETE /admin/rooms/{id}` would answer 409 `ROOM_IN_USE`. */
  readonly inUse: boolean;
  /** `true` when more upcoming bookings exist than the response lists. */
  readonly truncated: boolean;
  readonly items: readonly RoomUsageReferenceDto[];
}
