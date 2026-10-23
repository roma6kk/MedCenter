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

/**
 * Liveness probe for the compose healthcheck (`HEALTH_PATH=/health`). Not
 * routed by Traefik (only `/api/v1/admin/analytics|audit` is), carries no
 * data, hence `@Public()`. Readiness of PostgreSQL is enforced at boot: the
 * read-model is opened and migrated before the service listens.
 */
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
