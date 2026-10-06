import { Controller, Get } from '@nestjs/common';
import { Public } from '@medcenter/common';

interface ServiceInfo {
  readonly service: string;
  readonly status: 'ok';
}

@Controller()
export class AppController {
  @Public()
  @Get()
  getInfo(): ServiceInfo {
    return { service: 'auth-service', status: 'ok' };
  }
}