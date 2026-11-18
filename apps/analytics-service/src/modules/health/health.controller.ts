import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';

export class HealthResponseDoc implements HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  readonly status!: 'ok';

  @ApiProperty({ example: 'analytics-service' })
  readonly service!: string;
}

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

// Liveness only, no data (hence @Public()); PostgreSQL readiness is enforced at boot.
@ApiTags('analytics')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'The process serves HTTP', type: HealthResponseDoc })
  @ApiProblems([500])
  check(): HealthResponseDto {
    return { status: 'ok', service: 'analytics-service' };
  }
}
