import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

import { DATE_OR_ZONED_DATE_TIME } from '../../../common/zoned-date';

/** `?from=&to=` of API §5.2.7 / §5.2.8. Both optional — defaults live in `resolveSlotRange`. */
export class SlotRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Range start: a date or a date-time with an offset',
    example: '2026-11-02',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, {
    message: 'from must be a date or a date-time with an offset',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'Range end: a date or a date-time with an offset',
    example: '2026-11-09',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, { message: 'to must be a date or a date-time with an offset' })
  to?: string;
}
