import { Logger, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseSwaggerEnv } from '@medcenter/config';

import { enableRateLimit } from '../guards/enable-rate-limit';
import { applyHttpEdge, parseTrustProxy, type TrustProxySetting } from '../http';
import { applyObservability, type ReadinessDependency } from '../observability';
import { createValidationPipe } from '../pipes/validation.pipe';
import { setupSwagger } from '../swagger/setup-swagger';

export interface ServiceOptions {
  /** `catalog` for catalog-service: the log prefix, the readiness service name and the Swagger path. */
  readonly name: string;
  readonly module: Type<unknown>;
  readonly dependencies: readonly ReadinessDependency[];
  readonly defaultPort: number;
  /** Validates the service's own environment before anything starts; its `PORT` wins over the default. */
  readonly parseEnv?: (env: NodeJS.ProcessEnv) => { readonly PORT: number };
}

/** The HTTP pipeline every request goes through; the e2e suites call it too, so the pipeline under test is the one that ships. */
export function configureApp(app: INestApplication, trustProxy: TrustProxySetting): void {
  applyHttpEdge(app, trustProxy);
  app.useGlobalPipes(createValidationPipe());
}

/** `TRUST_PROXY` and the rate-limit store come first, so a bad value or a missing `REDIS_URL` fails the boot immediately. */
export async function createApp(module: Type<unknown>, env: NodeJS.ProcessEnv, logger: Logger): Promise<INestApplication> {
  const trustProxy = parseTrustProxy(env['TRUST_PROXY']);
  enableRateLimit(env, logger);
  const app = await NestFactory.create(module);
  configureApp(app, trustProxy);
  return app;
}

async function bootstrap(options: ServiceOptions): Promise<void> {
  const serviceName = `${options.name}-service`;
  const logger = new Logger('Bootstrap');
  const parsed = options.parseEnv?.(process.env);
  const app = await createApp(options.module, process.env, logger);
  applyObservability(app, { service: serviceName, dependencies: options.dependencies });
  setupSwagger(app, { service: options.name, enabled: parseSwaggerEnv(process.env).SWAGGER_ENABLED });
  app.enableShutdownHooks();
  const port = parsed?.PORT ?? process.env['PORT'] ?? options.defaultPort;
  await app.listen(port);
  logger.log(`${serviceName} listening on port ${port}`);
}

/** Boots a service the way every `main.ts` does; a failed boot is a logged fatal with exit code 1. */
export function runService(options: ServiceOptions): void {
  bootstrap(options).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`${options.name}-service failed to start`, error);
    process.exit(1);
  });
}
