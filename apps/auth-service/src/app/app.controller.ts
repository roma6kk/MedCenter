import { Controller, Get } from '@nestjs/common';

interface ServiceInfo {
  readonly service: string;
  readonly status: 'ok';
}

@Controller()
export class AppController {
  @Get()
  getInfo(): ServiceInfo {
    return { service: 'auth-service', status: 'ok' };
  }
}