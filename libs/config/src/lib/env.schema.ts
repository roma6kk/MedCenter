import { z } from 'zod';

/**
 * Full environment schema for a BFF service. Secrets (`FHIR_CLIENT_SECRET`)
 * have no defaults on purpose — a production deployment must provide them.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FHIR_BASE_URL: z.url(),
  FHIR_CLIENT_ID: z.string().min(1),
  FHIR_CLIENT_SECRET: z.string().min(1),
  JWT_JWKS_URI: z.url(),
  JWT_ISSUER: z.string().min(1),
  REDIS_URL: z.url(),
  RABBITMQ_URL: z.url(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  TERMINOLOGY_UPSTREAM_URL: z.url().optional(),
});

/** Only the keys the shared guard stack (`libs/common`) depends on. */
export const guardEnvSchema = envSchema.pick({
  JWT_JWKS_URI: true,
  JWT_ISSUER: true,
  REDIS_URL: true,
  RATE_LIMIT_PER_MINUTE: true,
});

/** Only the keys JWT signature verification needs. */
export const jwtEnvSchema = envSchema.pick({
  JWT_JWKS_URI: true,
  JWT_ISSUER: true,
});

/** Only the key the rate-limit guard reads. */
export const rateLimitEnvSchema = envSchema.pick({
  RATE_LIMIT_PER_MINUTE: true,
});

export type Env = z.infer<typeof envSchema>;
export type GuardEnv = z.infer<typeof guardEnvSchema>;
export type JwtEnv = z.infer<typeof jwtEnvSchema>;
export type RateLimitEnv = z.infer<typeof rateLimitEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}

export function parseGuardEnv(source: NodeJS.ProcessEnv): GuardEnv {
  return guardEnvSchema.parse(source);
}

export function parseJwtEnv(source: NodeJS.ProcessEnv): JwtEnv {
  return jwtEnvSchema.parse(source);
}

let cachedEnv: Env | null = null;

/** Parse once, then reuse: configuration is immutable for the process lifetime. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cachedEnv ??= parseEnv(source);
  return cachedEnv;
}

export function clearEnvCache(): void {
  cachedEnv = null;
}
