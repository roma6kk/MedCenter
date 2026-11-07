import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { HealthResponseDto } from './health.controller';

export class HealthResponseDoc implements HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'notification-service' })
  service!: string;

  @ApiPropertyOptional({ enum: ['disconnected'] })
  consumer?: 'disconnected';
}
