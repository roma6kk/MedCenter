/**
 * One resource that uses the room (API §4.7). The frontend `RoomUsageDrawer`
 * renders `resourceType`, `id` and `display`; the remaining fields are
 * additive detail for API clients.
 */
export interface RoomUsageReferenceDto {
  readonly resourceType: 'Schedule' | 'PractitionerRole' | 'HealthcareService' | 'Slot';
  readonly id: string;
  /**
   * Human-readable line: the names and the clinic-time (Europe/Minsk) period of the resource, in the language of
   * `Accept-Language` (en, else ru). It carries no active/inactive wording — `isActive` does.
   */
  readonly display: string;
  /** `Schedule`, `PractitionerRole` and `HealthcareService` only: `false` for a deactivated one that still pins the room. */
  readonly isActive?: boolean;
  /** `Slot` only: owning schedule and the booked period. */
  readonly scheduleId?: string;
  readonly start?: string;
  readonly end?: string;
}

/**
 * API §4.7 response. `items` lists every `Schedule`, `PractitionerRole` and
 * `HealthcareService` that references the room first (what makes `DELETE`
 * answer 409 `ROOM_IN_USE`), then its upcoming booked (`busy`) `Slot`s sorted by
 * `start` — a booked appointment holds its slot busy (ADR-012), so these are the
 * room's upcoming appointments.
 */
export interface RoomUsageResponseDto {
  readonly roomId: string;
  /** `true` exactly when `DELETE /admin/rooms/{id}` would answer 409 `ROOM_IN_USE`. */
  readonly inUse: boolean;
  /** `true` when more upcoming bookings exist than the response lists. */
  readonly truncated: boolean;
  readonly items: readonly RoomUsageReferenceDto[];
}
