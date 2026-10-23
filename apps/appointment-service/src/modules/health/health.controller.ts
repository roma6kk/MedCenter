import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';

import { HealthResponseDoc } from './health-response.doc';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

/**
 * Liveness probe for the container runtime (architect §7, compose
 * `x-bff-healthcheck`). Not routed by Traefik (only `/api/v1/**` is) and
 * carries no data, hence `@Public()`. `@nestjs/terminus` is not installed, so
 * HAPI/Redis readiness is not probed here.
 */
@ApiTags('appointment')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe of the service' })
  @ApiResponse({ status: 200, description: 'The service is up', type: HealthResponseDoc })
  @ApiProblems([429, 500])
  check(): HealthResponseDto {
    return { status: 'ok', service: 'appointment-service' };
  }
}
