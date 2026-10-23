import { Controller, Get } from '@nestjs/common';
import { ApiProblems, Public } from '@medcenter/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ServiceStatusDoc } from '../oauth/dto/oauth-response.doc';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

/**
 * Liveness probe for the container runtime (architect §7, compose
 * `x-bff-healthcheck`). Not routed by Traefik and carries no data, hence
 * `@Public()`. `@nestjs/terminus` is not installed, so PostgreSQL/HAPI
 * readiness is not probed here — a failed migration already fails the boot.
 */
@ApiTags('auth')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'The service is up', type: ServiceStatusDoc })
  @ApiProblems([429, 500])
  check(): HealthResponseDto {
    return { status: 'ok', service: 'auth-service' };
  }
}
