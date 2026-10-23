import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PageMetaDto, PaginatedResponseDto } from '@medcenter/contracts';

import type { AuditAction } from '../../../database/entities/audit-event-read.entity';
import type { AuditEventDto } from './audit-event.dto';

export const AUDIT_ACTIONS: readonly AuditAction[] = ['create', 'update', 'delete', 'read', 'denied', 'emergency-bypass'];

/** Swagger description of `AuditEventDto` (API §9.4). */
export class AuditEventDoc implements AuditEventDto {
  @ApiProperty({ description: 'AuditEvent id (FHIR id)' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ description: 'Token `sub` or an agent reference such as PractitionerRole/{id}; empty when unknown' })
  userId!: string;

  @ApiProperty({ enum: AUDIT_ACTIONS, enumName: 'AuditAction' })
  action!: AuditAction;

  @ApiProperty({ example: 'Appointment' })
  resourceType!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty()
  requestId!: string;

  @ApiPropertyOptional({ description: 'Only an `emergency-bypass` event has one (ADR-019)' })
  reason?: string;
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

/** `PaginatedResponseDto<AuditEventDto>` for Swagger. */
export class AuditPageDoc implements PaginatedResponseDto<AuditEventDoc> {
  @ApiProperty({ type: [AuditEventDoc] })
  items!: AuditEventDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
