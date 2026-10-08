/** API §4.x `RoomResponseDto` (row 344 of the API spec). */
export interface RoomResponseDto {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number;
  readonly description?: string;
  readonly isActive: boolean;
}
