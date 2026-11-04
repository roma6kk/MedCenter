import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyObservability } from '@medcenter/common';

import { AppModule } from './app/app.module';

/**
 * The relay has no public API: the only HTTP routes are `/health` (container
 * probe), `/ready` and `/metrics`, none of them routed through Traefik. There is no guard stack because
 * there is nothing to protect (ADR-021).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  // NFR-007: JSON logs with the request id, RED metrics at /metrics and dependency readiness at /ready (internal only, not routed by Traefik).
  applyObservability(app, { service: 'outbox-relay', dependencies: ['hapi', 'rabbitmq'] });
  app.enableShutdownHooks();
  const port = process.env['PORT'] ?? 3009;
  await app.listen(port);
  logger.log(`outbox-relay listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('outbox-relay failed to start', error);
  process.exit(1);
});
