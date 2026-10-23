import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

/**
 * The relay has no public API: the only HTTP route is `/health` for the container
 * probe, and it is not routed through Traefik. There is no guard stack because
 * there is nothing to protect (ADR-021).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
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
