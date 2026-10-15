import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

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
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'auth-service' };
  }
}
