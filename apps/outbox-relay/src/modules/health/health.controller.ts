import { Controller, Get } from '@nestjs/common';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

/** Liveness probe for the container runtime (compose `x-bff-healthcheck`); not routed by Traefik. */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'outbox-relay' };
  }
}
