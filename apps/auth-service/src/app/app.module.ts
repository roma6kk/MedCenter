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

import { AppController } from './app.controller';

/**
 * The guard stack is mounted through `APP_GUARD` on purpose (ADR-009): it is
 * the global default, so no service can ship without JWT → scopes → RBAC →
 * rate-limit protection living behind Traefik.
 */
@Module({
  controllers: [AppController],
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