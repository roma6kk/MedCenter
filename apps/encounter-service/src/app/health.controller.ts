import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';

class HealthStatus {
  @ApiProperty({ example: 'encounter-service' })
  readonly service!: string;

  @ApiProperty({ enum: ['ok'] })
  readonly status!: 'ok';
}

/**
 * Liveness probe for the compose healthcheck (`HEALTH_PATH=/health`). It only
 * proves the process serves HTTP; HAPI outages surface on the API
 * routes as 502/504 and in the logs.
 */
@ApiTags('encounter')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'The process serves HTTP', type: HealthStatus })
  @ApiProblems([500])
  check(): HealthStatus {
    return { service: 'encounter-service', status: 'ok' };
  }
}
