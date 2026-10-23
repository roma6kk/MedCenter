import { ApiProperty } from '@nestjs/swagger';

import type { GenerateSlotsResult } from '../slot-generator.service';

/** Documentation class of `GenerateSlotsResult` (API §5.2.5). */
export class GenerateSlotsResultDoc implements GenerateSlotsResult {
  @ApiProperty({ minimum: 0, description: 'Slots created by this call', example: 40 })
  generated!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Slots that already existed (not duplicated)',
    example: 2,
  })
  skipped!: number;
}
