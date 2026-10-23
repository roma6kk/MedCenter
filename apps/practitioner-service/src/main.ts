import { Logger } from '@nestjs/common';
import { setupSwagger } from '@medcenter/common';
import { parseSwaggerEnv } from '@medcenter/config';

import { createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await createApp(process.env, logger);
  // API §10: Swagger UI at /api/docs/practitioner and its JSON at /api/docs/practitioner-json, only when SWAGGER_ENABLED=true.
  setupSwagger(app, { service: 'practitioner', enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  const port = process.env['PORT'] ?? 3002;
  await app.listen(port);
  logger.log(`practitioner-service listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('practitioner-service failed to start', error);
  process.exit(1);
});
