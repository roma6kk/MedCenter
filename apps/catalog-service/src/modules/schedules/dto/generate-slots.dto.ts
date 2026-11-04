import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

import { CALENDAR_DATE } from '../../../common/zoned-date';

/** API §5.2.5 `GenerateSlotsDto` — `to - from` must stay within 90 days. */
export class GenerateSlotsDto {
  @ApiProperty({
    format: 'date',
    description: 'First day to generate (inside the planning horizon)',
    example: '2026-11-02',
  })
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'from must be a calendar date YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    format: 'date',
    description: 'Last day to generate; at most 90 days after `from`',
    example: '2026-11-30',
  })
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'to must be a calendar date YYYY-MM-DD' })
  to!: string;
}
