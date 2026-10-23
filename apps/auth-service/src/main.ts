import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createValidationPipe, RedisRateLimitStore, setRateLimitStore, setupSwagger } from '@medcenter/common';
import { parseGuardEnv, parseSwaggerEnv } from '@medcenter/config';
import Redis from 'ioredis';

import { AppModule } from './app/app.module';
import { parseTrustProxy } from './config/trust-proxy';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Parsed before the app is created so a bad TRUST_PROXY fails the boot immediately.
  const trustProxy = parseTrustProxy(process.env['TRUST_PROXY']);
  const { REDIS_URL } = parseGuardEnv(process.env);
  const app = await NestFactory.create(AppModule);
  // Behind Traefik, `req.ip` is the proxy unless Express is told to read
  // `X-Forwarded-For`. Without this every client shares the proxy's rate-limit bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  // Shared across replicas so the per-minute budget holds cluster-wide. Redis
  // errors fail open in `RateLimitGuard`, so the connection's error listener only logs.
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', (error: Error) => {
    logger.warn(`Redis connection error: ${error.message}`);
  });
  setRateLimitStore(new RedisRateLimitStore(redis));
  // Global on purpose: without it every class-validator decorator in the service
  // is inert (the OAuth DTOs and everything Task 7 adds). See
  // `libs/common/src/lib/pipes/validation.pipe.ts` for the option choices.
  app.useGlobalPipes(createValidationPipe());
  // M9: terminate (not just warn) on a signal so in-flight requests drain;
  // a failed boot below becomes a logged fatal with a non-zero exit instead
  // of an unhandled rejection nobody monitors.
  // API §10: Swagger UI at /api/docs/auth and its JSON at /api/docs/auth-json, only when SWAGGER_ENABLED=true.
  setupSwagger(app, { service: 'auth', enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  await app.listen(process.env['PORT'] ?? 3001);
  logger.log(`auth-service listening on port ${process.env['PORT'] ?? 3001}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('auth-service failed to start', error);
  process.exit(1);
});
