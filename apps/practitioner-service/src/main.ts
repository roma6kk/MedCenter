import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createValidationPipe } from '@medcenter/common';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  // Global on purpose: without it every class-validator decorator in the
  // service is inert (see `libs/common/src/lib/pipes/validation.pipe.ts`).
  app.useGlobalPipes(createValidationPipe());
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
