import { Controller, Get } from '@nestjs/common';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponseDto {
    return { status: 'ok', service: 'outbox-relay' };
  }
}
