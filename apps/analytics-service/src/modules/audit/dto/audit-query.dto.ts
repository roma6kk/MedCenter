import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

import { DateRangeQueryDto } from '../../shared/date-range-query.dto';

const ENTITY_FILTER_PATTERN = /^[A-Z][A-Za-z]{1,63}(\/[A-Za-z0-9\-.]{1,64})?$/;

const USER_ID_FILTER_PATTERN = /^[A-Za-z0-9\-._:@/]{1,128}$/;

const MAX_AUDIT_PAGE = 10_000;

export class AuditQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Resource type or one resource reference', example: 'Appointment/1234' })
  @IsOptional()
  @Matches(ENTITY_FILTER_PATTERN, { message: 'entity must be a resource type or a Type/id reference' })
  readonly entity?: string;

  @ApiPropertyOptional({ description: 'Token `sub` or agent reference such as PractitionerRole/{id}', maxLength: 128 })
  @IsOptional()
  @Matches(USER_ID_FILTER_PATTERN, { message: 'userId contains unsupported characters' })
  readonly userId?: string;

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
