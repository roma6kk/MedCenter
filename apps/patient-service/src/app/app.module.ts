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
import { PatientsModule } from '../modules/patients/patients.module';
import { RelatedPersonsModule } from '../modules/related-persons/related-persons.module';

/**
 * The guard stack is mounted through `APP_GUARD` (ADR-009): JWT → scopes →
 * RBAC → rate-limit is the global default, so no route ships unprotected.
 */
@Module({
  imports: [HealthModule, PatientsModule, RelatedPersonsModule],
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
