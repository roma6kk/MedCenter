import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
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
import { LOGIN_ROUTE, REGISTER_ROUTE, pinCredentialRouteBucket } from './credential-route.middleware';
import { ClinicModule } from '../modules/clinic/clinic.module';
import { HealthModule } from '../modules/health/health.module';
import { OAuthModule } from '../modules/oauth/oauth.module';
import { TerminologyModule } from '../modules/terminology/terminology.module';
import { UsersModule } from '../modules/users/users.module';

function decodePemFromBase64Env(key: string): string {
  const encoded = process.env[key];
  if (!encoded) {
    return '';
  }
  try {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function ensureSigningEnv(): void {
  const privateKey = decodePemFromBase64Env('JWT_PRIVATE_KEY_B64');
  const publicKey = decodePemFromBase64Env('JWT_PUBLIC_KEY_B64');
  if (privateKey.includes('-----BEGIN ')) {
    process.env['JWT_PRIVATE_KEY'] = privateKey;
  }
  if (publicKey.includes('-----BEGIN ')) {
    process.env['JWT_PUBLIC_KEY'] = publicKey;
  }
}

ensureSigningEnv();

@Module({
  imports: [OAuthModule, UsersModule, TerminologyModule, ClinicModule, HealthModule],
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
    for (const route of [LOGIN_ROUTE, REGISTER_ROUTE]) {
      consumer
        .apply(pinCredentialRouteBucket(route))
        .forRoutes({ path: route.slice(1), method: RequestMethod.POST });
    }
  }
}
