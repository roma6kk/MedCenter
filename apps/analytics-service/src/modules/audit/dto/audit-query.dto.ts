import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

import { AUDIT_ACTIONS, type AuditAction } from '../../../database/entities/audit-event-read.entity';
import { DateRangeQueryDto } from '../../shared/date-range-query.dto';

const ENTITY_FILTER_PATTERN = /^[A-Z][A-Za-z]{1,63}(\/[A-Za-z0-9\-.]{1,64})?$/;

const USER_ID_FILTER_PATTERN = /^[A-Za-z0-9\-._:@/]{1,128}$/;

const MAX_AUDIT_PAGE = 10_000;

export function toActionList({ value }: { readonly value: unknown }): unknown {
  const parts = Array.isArray(value) ? (value as unknown[]) : [value];
  if (!parts.every((part) => typeof part === 'string')) {
    return value;
  }
  const items = (parts as string[]).flatMap((part) => part.split(',')).map((item) => item.trim());
  const meaningful = items.length === 1 && items[0] === '' ? [] : items;
  return meaningful.length === 0 ? undefined : [...new Set(meaningful)];
}

export class AuditQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Resource type or one resource reference', example: 'Appointment/1234' })
  @IsOptional()
  @Matches(ENTITY_FILTER_PATTERN, { message: 'entity must be a resource type or a Type/id reference' })
  readonly entity?: string;

  @ApiPropertyOptional({ description: 'Token `sub` or agent reference such as PractitionerRole/{id}', maxLength: 128 })
  @IsOptional()
  @Matches(USER_ID_FILTER_PATTERN, { message: 'userId contains unsupported characters' })
  readonly userId?: string;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    enum: AUDIT_ACTIONS,
    enumName: 'AuditAction',
    description: 'One action or a comma list (OR); repeated parameters are accepted too',
    example: 'login,login-failed,logout',
  })
  @IsOptional()
  @Transform(toActionList)
  @ArrayMaxSize(AUDIT_ACTIONS.length)
  @IsIn(AUDIT_ACTIONS, { each: true })
  readonly action?: AuditAction[];

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_AUDIT_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_PAGE)
  readonly page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly pageSize?: number;
}
