import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PageMetaDto, PaginatedResponseDto } from '@medcenter/contracts';

import { NOTIFICATION_KINDS, type NotificationKind } from '../notification-kind';
import type { NotificationResponseDto } from './notification-response.dto';

/** Swagger description of `NotificationResponseDto` (API §8.1). */
export class NotificationResponseDoc implements NotificationResponseDto {
  @ApiProperty({ description: 'Communication id (FHIR id)', example: '3f1c2a9e-7b4d-4c58-9a0e-5d6f8b1c2d3e' })
  id!: string;

  @ApiProperty({ description: 'What the notification is about', enum: ['appointment', 'encounter', 'registration'], example: 'appointment' })
  category!: string;

  @ApiProperty({ example: 'Вы записаны на приём. Начало: 25.10.2026 09:00 (время Минска)' })
  text!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  sent!: string;

  @ApiProperty()
  read!: boolean;

  @ApiPropertyOptional({
    description: 'Which event it is, so the client can word the notification in the UI language; absent for older notifications (show `text`)',
    enum: NOTIFICATION_KINDS,
    example: 'appointment.booked',
  })
  kind?: NotificationKind;

  @ApiPropertyOptional({ description: 'Start of the booked appointment, UTC (only `appointment.booked`)', type: String, format: 'date-time' })
  start?: string;

  @ApiPropertyOptional({ description: 'Appointment the notification is about (Communication.about)' })
  appointmentId?: string;

  @ApiPropertyOptional({ description: 'Encounter a "visit completed" notification is about' })
  encounterId?: string;
}

export class PageMetaDoc implements PageMetaDto {
  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  pageSize!: number;

  @ApiProperty({ minimum: 0, example: 42 })
  totalItems!: number;

  @ApiProperty({ minimum: 0, example: 3 })
  totalPages!: number;
}

/** `PaginatedResponseDto<NotificationResponseDto>` for Swagger. */
export class NotificationPageDoc implements PaginatedResponseDto<NotificationResponseDoc> {
  @ApiProperty({ type: [NotificationResponseDoc] })
  items!: NotificationResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}

/** API §8.2 response. */
export class UnreadCountDoc {
  @ApiProperty({ minimum: 0, example: 3 })
  count!: number;
}

/** API §8.4 response. */
export class MarkAllReadDoc {
  @ApiProperty({ description: 'Notifications marked as read by this call (up to 200)', minimum: 0, example: 5 })
  updated!: number;
}
