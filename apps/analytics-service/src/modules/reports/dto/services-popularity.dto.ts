import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { DateRangeQueryDto } from '../../shared/date-range-query.dto';
import type { MeasureReportDto } from './measure-report.dto';

export const DEFAULT_TOP_SERVICES = 10;
const MAX_TOP_SERVICES = 50;

export class ServicesPopularityQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'How many services to return', minimum: 1, maximum: MAX_TOP_SERVICES, default: DEFAULT_TOP_SERVICES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TOP_SERVICES)
  readonly top?: number;
}

export interface ServicesPopularityDto extends MeasureReportDto {
  readonly measure: 'services-popularity';
  readonly others: number;
}
