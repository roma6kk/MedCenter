import { Controller, Get } from '@nestjs/common';
import { ApiProblems, Public } from '@medcenter/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ServiceStatusDoc } from '../modules/oauth/dto/oauth-response.doc';

interface ServiceInfo {
  readonly service: string;
  readonly status: 'ok';
}

@ApiTags('auth')
@Controller()
export class AppController {
  @Public()
  @ApiOperation({ summary: 'Service info' })
  @ApiResponse({ status: 200, description: 'Service name and status', type: ServiceStatusDoc })
  @ApiProblems([429, 500])
  @Get()
  getInfo(): ServiceInfo {
    return { service: 'auth-service', status: 'ok' };
  }
}