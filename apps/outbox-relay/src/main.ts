import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyObservability } from '@medcenter/common';

import { AppModule } from './app/app.module';

/** No guard stack: the relay has no public API, only `/health`, `/ready` and `/metrics`, none routed by Traefik. */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
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
