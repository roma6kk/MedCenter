import { Logger } from '@nestjs/common';

import { createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await createApp(process.env, logger);
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
