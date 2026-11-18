export interface RoomResponseDto {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number;
  readonly description?: string;
  readonly isActive: boolean;
}
