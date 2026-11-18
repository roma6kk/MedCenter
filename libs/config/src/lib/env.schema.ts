import { z } from 'zod';

/** An empty variable means unset. Wrap optional keys only: a required key stays strict so an empty value still fails the boot. */
export function blankAsUnset<T extends z.ZodType>(schema: T): z.ZodType<z.output<T>, unknown> {
  return z.preprocess((value: unknown) => (value === '' ? undefined : value), schema);
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: blankAsUnset(z.coerce.number().int().positive().default(3000)),
  FHIR_BASE_URL: z.url(),
  FHIR_CLIENT_ID: z.string().min(1),
  FHIR_CLIENT_SECRET: z.string().min(1),
  JWT_JWKS_URI: z.url(),
  JWT_ISSUER: z.string().min(1),
  JWT_PRIVATE_KEY: blankAsUnset(z.string().min(1).optional()),
  JWT_PUBLIC_KEY: blankAsUnset(z.string().min(1).optional()),
  REDIS_URL: z.url(),
  RABBITMQ_URL: z.url(),
  RATE_LIMIT_PER_MINUTE: blankAsUnset(z.coerce.number().int().positive().default(120)),
  TERMINOLOGY_UPSTREAM_URL: blankAsUnset(z.url().optional()),
  CONSENT_ENFORCEMENT: blankAsUnset(z.enum(['warn', 'block']).default('block')),
  SWAGGER_ENABLED: blankAsUnset(z.stringbool().default(false)),
});

export const guardEnvSchema = envSchema.pick({
  JWT_JWKS_URI: true,
  JWT_ISSUER: true,
  REDIS_URL: true,
  RATE_LIMIT_PER_MINUTE: true,
});

export const jwtEnvSchema = envSchema.pick({
  JWT_JWKS_URI: true,
  JWT_ISSUER: true,
});

export const swaggerEnvSchema = envSchema.pick({
  SWAGGER_ENABLED: true,
});

export const rateLimitEnvSchema = envSchema.pick({
  RATE_LIMIT_PER_MINUTE: true,
});

export const jwtSigningEnvSchema = envSchema
  .pick({ JWT_PRIVATE_KEY: true, JWT_PUBLIC_KEY: true })
  .required();

export type Env = z.infer<typeof envSchema>;
export type GuardEnv = z.infer<typeof guardEnvSchema>;
export type SwaggerEnv = z.infer<typeof swaggerEnvSchema>;
export type JwtEnv = z.infer<typeof jwtEnvSchema>;
export type RateLimitEnv = z.infer<typeof rateLimitEnvSchema>;
export type JwtSigningEnv = z.infer<typeof jwtSigningEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}

export function parseGuardEnv(source: NodeJS.ProcessEnv): GuardEnv {
  return guardEnvSchema.parse(source);
}

export function parseSwaggerEnv(source: NodeJS.ProcessEnv): SwaggerEnv {
  return swaggerEnvSchema.parse(source);
}

export function parseJwtEnv(source: NodeJS.ProcessEnv): JwtEnv {
  return jwtEnvSchema.parse(source);
}

export function parseJwtSigningEnv(source: NodeJS.ProcessEnv): JwtSigningEnv {
  return jwtSigningEnvSchema.parse(source);
}

let cachedEnv: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cachedEnv ??= parseEnv(source);
  return cachedEnv;
}

export function clearEnvCache(): void {
  cachedEnv = null;
}
