import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyHttpEdge, applyObservability, createValidationPipe, enableRateLimit, setupSwagger } from '@medcenter/common';
import { parseSwaggerEnv } from '@medcenter/config';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Parsed before the app is created, so a missing guard variable fails the boot immediately.
  // NFR-006: the per-user budget is shared by every replica through Redis; Redis errors fail open in the guard.
  enableRateLimit(process.env, logger);
  const app = await NestFactory.create(AppModule);
  // NFR-007: JSON logs with the request id, RED metrics at /metrics and dependency readiness at /ready (internal only, not routed by Traefik).
  applyObservability(app, { service: 'encounter-service', dependencies: ['hapi'] });
  // Trust the Traefik hop (TRUST_PROXY) so the rate limiter keys on the real client; drop X-Powered-By.
  applyHttpEdge(app);
  // Global on purpose: without it every class-validator decorator in the
  // service is inert (see `libs/common/src/lib/pipes/validation.pipe.ts`).
  app.useGlobalPipes(createValidationPipe());
  // API §10: Swagger UI at /api/docs/encounter and its JSON at /api/docs/encounter-json, only when SWAGGER_ENABLED=true.
  setupSwagger(app, { service: 'encounter', enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  const port = process.env['PORT'] ?? 3007;
  await app.listen(port);
  logger.log(`encounter-service listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('encounter-service failed to start', error);
  process.exit(1);
});
