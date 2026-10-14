import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

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
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'appointment-service' };
  }
}
