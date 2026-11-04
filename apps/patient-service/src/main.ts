import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyHttpEdge, applyObservability, createValidationPipe, enableRateLimit, setupSwagger } from '@medcenter/common';
import { parseSwaggerEnv } from '@medcenter/config';

import { AppModule } from './app/app.module';
import { parsePatientServiceEnv } from './config/patient-service-env';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Validated before anything starts, so a missing variable fails the boot with a clear zod error.
  const env = parsePatientServiceEnv(process.env);
  const app = await NestFactory.create(AppModule);
  // NFR-007: JSON logs with the request id, RED metrics at /metrics and dependency readiness at /ready (internal only, not routed by Traefik).
  applyObservability(app, { service: 'patient-service', dependencies: ['hapi'] });
  // Trust the Traefik hop (TRUST_PROXY) so the rate limiter keys on the real client; drop X-Powered-By.
  applyHttpEdge(app);
  // NFR-006: the per-user budget is shared by every replica. Redis errors fail
  // open in `RateLimitGuard`, so the connection's error listener only logs.
  enableRateLimit(process.env, logger);
  // Global on purpose: without it every class-validator decorator in the
  // service is inert (see `libs/common/src/lib/pipes/validation.pipe.ts`).
  app.useGlobalPipes(createValidationPipe());
  // API §10: Swagger UI at /api/docs/patient and its JSON at /api/docs/patient-json, only when SWAGGER_ENABLED=true.
  setupSwagger(app, { service: 'patient', enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  logger.log(`patient-service listening on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('patient-service failed to start', error);
  process.exit(1);
});
