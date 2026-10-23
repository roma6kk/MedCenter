import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { PROBLEM_DETAILS_SCHEMA, problemDetailsSchema } from './problem-details.schema';

export interface SwaggerSetupOptions {
  /** Short service name used in the URLs: `appointment` serves `/api/docs/appointment`. */
  readonly service: string;
  /** Human title; defaults to `MedCenter <service>-service API`. */
  readonly title?: string;
  readonly description?: string;
  /** `parseSwaggerEnv(process.env).SWAGGER_ENABLED` (`libs/config`): off by default, API §10. */
  readonly enabled: boolean;
}

export const BEARER_AUTH_NAME = 'bearer';

/** The service's OpenAPI document with the global RFC 7807 `problemDetails` schema and the Bearer scheme. */
export function buildOpenApiDocument(app: INestApplication, options: SwaggerSetupOptions): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(options.title ?? `MedCenter ${options.service}-service API`)
    .setDescription(
      options.description ??
        `REST API of ${options.service}-service (API specification, section ${options.service}). ` +
          'Errors are RFC 7807 `application/problem+json` (schema `problemDetails`, catalogue in API spec section 1). ' +
          'Obtain a token at `POST /oauth/token` and authorize with `Bearer <JWT>`.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_AUTH_NAME)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, [PROBLEM_DETAILS_SCHEMA]: problemDetailsSchema() },
  };
  return document;
}

/**
 * Mounts the Swagger UI at `/api/docs/<service>` and the OpenAPI JSON at `/api/docs/<service>-json`
 * (API §10), both on the edge route `PathPrefix(/api/docs/<service>)`. Does nothing unless enabled
 * (`SWAGGER_ENABLED=true`). Returns whether the documentation was mounted.
 */
export function setupSwagger(app: INestApplication, options: SwaggerSetupOptions): boolean {
  if (!(options.enabled)) {
    return false;
  }
  const base = `api/docs/${options.service}`;
  SwaggerModule.setup(base, app, buildOpenApiDocument(app, options), {
    jsonDocumentUrl: `${base}-json`,
    yamlDocumentUrl: `${base}-yaml`,
    swaggerOptions: { persistAuthorization: true },
  });
  return true;
}
