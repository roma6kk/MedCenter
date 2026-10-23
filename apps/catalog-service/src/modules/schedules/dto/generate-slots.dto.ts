import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

/** API §5.2.5 `GenerateSlotsDto` — `to - from` must stay within 90 days. */
export class GenerateSlotsDto {
  @ApiProperty({
    format: 'date',
    description: 'First day to generate (inside the planning horizon)',
    example: '2026-11-02',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    format: 'date',
    description: 'Last day to generate; at most 90 days after `from`',
    example: '2026-11-30',
  })
  @IsDateString()
  to!: string;
}
