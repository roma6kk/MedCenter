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
import { OAuthModule } from '../modules/oauth/oauth.module';

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
  if (privateKey && privateKey.startsWith('-----BEGIN RSA PRIVATE KEY-----')) {
    process.env['JWT_PRIVATE_KEY'] = privateKey;
  }
  if (publicKey && publicKey.startsWith('-----BEGIN RSA PUBLIC KEY-----')) {
    process.env['JWT_PUBLIC_KEY'] = publicKey;
  }
}

ensureSigningEnv();

/**
 * The guard stack is mounted through `APP_GUARD` on purpose (ADR-009): it is
 * the global default, so no service can ship without JWT → scopes → RBAC →
 * rate-limit protection living behind Traefik.
 */
@Module({
  imports: [OAuthModule],
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
