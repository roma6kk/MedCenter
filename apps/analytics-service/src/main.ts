import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createValidationPipe, RedisRateLimitStore, setRateLimitStore } from '@medcenter/common';
import { parseGuardEnv } from '@medcenter/config';
import Redis from 'ioredis';

import { AppModule } from './app/app.module';

/**
 * NFR-006: `RateLimitGuard` only counts when a store is set; without one the
 * per-user budget (120 req/min) is silently off. The store is shared through
 * Redis so the budget holds across replicas; Redis errors fail open in the guard.
 */
function enableRateLimit(logger: Logger): void {
  const { REDIS_URL } = parseGuardEnv(process.env);
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', (error: Error) => {
    logger.warn(`Rate-limit Redis connection error: ${error.message}`);
  });
  setRateLimitStore(new RedisRateLimitStore(redis));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Parsed before the app is created, so a missing guard variable fails the boot immediately.
  enableRateLimit(logger);
  // Creating the app opens and migrates the `analytics` read-model (DatabaseModule).
  const app = await NestFactory.create(AppModule);
  // Global on purpose: without it every class-validator decorator in the
  // service is inert (see `libs/common/src/lib/pipes/validation.pipe.ts`).
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  const port = process.env['PORT'] ?? 3008;
  await app.listen(port);
  logger.log(`analytics-service listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('analytics-service failed to start', error);
  process.exit(1);
});
