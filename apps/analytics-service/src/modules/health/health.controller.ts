import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

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
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'analytics-service' };
  }
}
