import { Controller, Get } from '@nestjs/common';
import { ApiProblems, Public } from '@medcenter/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ServiceStatusDoc } from '../oauth/dto/oauth-response.doc';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

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
