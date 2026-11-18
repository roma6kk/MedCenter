import { ApiProperty } from '@nestjs/swagger';

import type { HealthResponseDto } from './health.controller';

export class HealthResponseDoc implements HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'catalog-service' })
  service!: string;
}
