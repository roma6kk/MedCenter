import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageMetaDoc } from '../../../common/page-meta.doc';
import type { RoomResponseDto } from './room-response.dto';
import type { RoomUsageReferenceDto, RoomUsageResponseDto } from './room-usage-response.dto';

/** Swagger projection of `RoomResponseDto` (API §4.3-4.5). */
export class RoomResponseDoc implements RoomResponseDto {
  @ApiProperty({ description: 'Location id (FHIR id)' })
  readonly id!: string;

  @ApiProperty({ description: 'Unique room identifier (case and edge-space insensitive)', example: '204-Х' })
  readonly identifier!: string;

  @ApiProperty({ example: 'Кабинет 204' })
  readonly name!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 2 })
  readonly floor?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  readonly description?: string;

  @ApiProperty({ description: 'Location.status is active' })
  readonly isActive!: boolean;
}

/** `{ items, meta }` envelope of the room listing. */
export class RoomPageDoc {
  @ApiProperty({ type: [RoomResponseDoc] })
  readonly items!: RoomResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  readonly meta!: PageMetaDoc;
}

/** Swagger projection of `RoomUsageReferenceDto` (API §4.7). */
export class RoomUsageReferenceDoc implements RoomUsageReferenceDto {
  @ApiProperty({ enum: ['Schedule', 'Slot'] })
  readonly resourceType!: 'Schedule' | 'Slot';

  @ApiProperty()
  readonly id!: string;

  @ApiProperty({ description: 'Human-readable line in clinic time (Europe/Minsk)' })
  readonly display!: string;

  @ApiPropertyOptional({ description: 'Schedule only: false for a deactivated schedule that still pins the room' })
  readonly isActive?: boolean;

  @ApiPropertyOptional({ description: 'Slot only: owning schedule id' })
  readonly scheduleId?: string;

  @ApiPropertyOptional({ description: 'Slot only: start of the booked period', format: 'date-time' })
  readonly start?: string;

  @ApiPropertyOptional({ description: 'Slot only: end of the booked period', format: 'date-time' })
  readonly end?: string;
}

/** Swagger projection of `RoomUsageResponseDto` (API §4.7). */
export class RoomUsageResponseDoc implements RoomUsageResponseDto {
  @ApiProperty()
  readonly roomId!: string;

  @ApiProperty({ description: 'True exactly when DELETE would answer 409 ROOM_IN_USE' })
  readonly inUse!: boolean;

  @ApiProperty({ description: 'True when more upcoming bookings exist than listed' })
  readonly truncated!: boolean;

  @ApiProperty({ type: [RoomUsageReferenceDoc], description: 'Schedules first, then upcoming busy slots by start' })
  readonly items!: readonly RoomUsageReferenceDoc[];
}
