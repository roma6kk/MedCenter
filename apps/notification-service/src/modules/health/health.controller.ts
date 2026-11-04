import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';
import type { Response } from 'express';

import { ConsumerService } from '../notifications/consumer.service';
import { HealthResponseDoc } from './health-response.doc';

export interface HealthResponseDto {
  readonly status: 'ok' | 'degraded';
  readonly service: string;
  readonly consumer?: 'disconnected';
}

/**
 * Liveness probe for the container runtime (architect §7, compose
 * `x-bff-healthcheck`). Not routed by Traefik (only `/api/v1/**` is) and
 * carries no data, hence `@Public()`. Unlike the other services this one has a
 * background duty besides HTTP: while the RabbitMQ consumer is enabled but not
 * connected no notification is written, so the probe answers 503 and the
 * container shows as unhealthy instead of silently idle.
 */
@ApiTags('notification')
@Controller('health')
export class HealthController {
  constructor(private readonly consumer: ConsumerService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe of the service and its event consumer' })
  @ApiResponse({ status: 200, description: 'The service is up and consuming', type: HealthResponseDoc })
  @ApiResponse({ status: 503, description: 'The RabbitMQ consumer is not connected', type: HealthResponseDoc })
  @ApiProblems([429, 500])
  check(@Res({ passthrough: true }) response: Response): HealthResponseDto {
    if (process.env['CONSUMER_ENABLED'] !== 'false' && !this.consumer.isListening()) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', service: 'notification-service', consumer: 'disconnected' };
    }
    return { status: 'ok', service: 'notification-service' };
  }
}
