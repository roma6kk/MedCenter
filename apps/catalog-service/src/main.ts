import { Logger } from '@nestjs/common';
import { applyObservability, setupSwagger } from '@medcenter/common';
import { parseSwaggerEnv } from '@medcenter/config';

import { createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await createApp(process.env, logger);
  // NFR-007: JSON logs with the request id, RED metrics at /metrics and dependency readiness at /ready (internal only, not routed by Traefik).
  applyObservability(app, { service: 'catalog-service', dependencies: ['hapi'] });
  // API §10: Swagger UI at /api/docs/catalog and its JSON at /api/docs/catalog-json, only when SWAGGER_ENABLED=true.
  setupSwagger(app, { service: 'catalog', enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  const port = process.env['PORT'] ?? 3003;
  await app.listen(port);
  logger.log(`catalog-service listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('catalog-service failed to start', error);
  process.exit(1);
});
