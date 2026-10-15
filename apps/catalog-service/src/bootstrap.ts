import type { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyHttpEdge, createValidationPipe, parseTrustProxy, type TrustProxySetting } from '@medcenter/common';

import { AppModule } from './app/app.module';
import { enableRateLimit } from './config/rate-limit';

/**
 * The HTTP pipeline every request goes through: the shared edge (`applyHttpEdge`:
 * `trust proxy`, so the rate-limit bucket is per client and not per Traefik, and
 * no `X-Powered-By`) and the global validation pipe (without it every
 * class-validator decorator in the service is inert, see `libs/common`
 * `validation.pipe.ts`).
 * `createApp` and the e2e suites call this same function, so the pipeline under
 * test is the pipeline that ships.
 */
export function configureApp(app: INestApplication, trustProxy: TrustProxySetting): void {
  applyHttpEdge(app, trustProxy);
  app.useGlobalPipes(createValidationPipe());
}

/**
 * Builds the app the way `main.ts` runs it. `TRUST_PROXY` is parsed and the
 * rate-limit store is installed before the app is created, so a bad value or a
 * missing guard variable (`REDIS_URL`) fails the boot immediately.
 */
export async function createApp(env: NodeJS.ProcessEnv, logger: Logger): Promise<INestApplication> {
  const trustProxy = parseTrustProxy(env['TRUST_PROXY']);
  enableRateLimit(env, logger);
  const app = await NestFactory.create(AppModule);
  configureApp(app, trustProxy);
  return app;
}
