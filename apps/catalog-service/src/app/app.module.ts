import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import {
  JwtAuthGuard,
  ProblemDetailsFilter,
  RateLimitGuard,
  RequestIdMiddleware,
  RoleGuard,
  ScopeGuard,
} from '@medcenter/common';

import { HealthModule } from '../modules/health/health.module';
import { CacheModule } from '../modules/cache/cache.module';
import { SchedulesModule } from '../modules/schedules/schedules.module';
import { ServicesModule } from '../modules/services/services.module';
import { SlotsModule } from '../modules/slots/slots.module';

@Module({
  imports: [HealthModule, CacheModule, ServicesModule, SchedulesModule, SlotsModule],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
