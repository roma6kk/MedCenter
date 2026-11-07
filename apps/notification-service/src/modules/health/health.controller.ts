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

/** 503 while the consumer is enabled but disconnected: no notification is written, so the container must show unhealthy. */
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
