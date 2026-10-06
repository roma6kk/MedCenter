import { NestFactory } from '@nestjs/core';
import { createValidationPipe } from '@medcenter/common';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Global on purpose: without it every class-validator decorator in the service
  // is inert (the OAuth DTOs and everything Task 7 adds). See
  // `libs/common/src/lib/pipes/validation.pipe.ts` for the option choices.
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env['PORT'] ?? 3001);
}

void bootstrap();
