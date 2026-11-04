import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  applyHttpEdge,
  createValidationPipe,
  enableRateLimit,
  parseTrustProxy,
  setupSwagger,
} from '@medcenter/common';
import { parseSwaggerEnv } from '@medcenter/config';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Parsed before the app is created so a bad TRUST_PROXY fails the boot immediately.
  const trustProxy = parseTrustProxy(process.env['TRUST_PROXY']);
  const app = await NestFactory.create(AppModule);
  // Trust proxy (every client would otherwise share the proxy's rate-limit bucket) and no X-Powered-By.
  applyHttpEdge(app, trustProxy);
  // Shared across replicas so the per-minute budget holds cluster-wide; Redis errors fail open in `RateLimitGuard`.
  enableRateLimit(process.env, logger);
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
