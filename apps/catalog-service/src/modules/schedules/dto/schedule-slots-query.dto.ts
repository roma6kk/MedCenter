import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

import { DATE_OR_ZONED_DATE_TIME } from '../../../common/zoned-date';

const SLOT_STATUS_LIST =
  /^(busy|free|busy-unavailable|busy-tentative|entered-in-error)(,(busy|free|busy-unavailable|busy-tentative|entered-in-error))*$/;

export class ScheduleSlotsQueryDto {
  @ApiProperty({
    description: 'Range start: a date or a date-time with an offset',
    example: '2026-11-02',
  })
  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, {
    message: 'from must be a date or a date-time with an offset',
  })
  from!: string;

  @ApiProperty({
    description: 'Range end: a date or a date-time with an offset',
    example: '2026-11-09',
  })
  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, { message: 'to must be a date or a date-time with an offset' })
  to!: string;

  @ApiPropertyOptional({
    description: 'Slot statuses, comma-separated (OR); free and busy only when absent',
    example: 'free,busy',
  })
  @IsOptional()
  @Matches(SLOT_STATUS_LIST, {
    message: 'status must be one or more Slot statuses separated by commas',
  })
  status?: string;
}
