import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

/**
 * Liveness probe for the container runtime (architect §7). Not routed by
 * Traefik (only `/api/v1/**` is), carries no data, hence `@Public()`.
 * `@nestjs/terminus` is not installed, so readiness of HAPI is not probed here.
 */
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'patient-service' };
  }
}
