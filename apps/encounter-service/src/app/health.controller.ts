import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

interface HealthStatus {
  readonly service: string;
  readonly status: 'ok';
}

/**
 * Liveness probe for the compose healthcheck (`HEALTH_PATH=/health`). It only
 * proves the process serves HTTP; HAPI/RabbitMQ outages surface on the API
 * routes as 502/504 and in the logs.
 */
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  check(): HealthStatus {
    return { service: 'encounter-service', status: 'ok' };
  }
}
