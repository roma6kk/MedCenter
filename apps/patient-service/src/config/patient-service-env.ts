import { envSchema } from '@medcenter/config';
import { z } from 'zod';

/**
 * Environment of patient-service, validated at boot (secrets only via env,
 * architect §6). Derived from the shared BFF schema in `libs/config`, minus
 * what this service does not use (RabbitMQ: it publishes no events). HAPI
 * client credentials are optional, but only as a pair.
 */
export const patientServiceEnvSchema = envSchema
  .pick({
    NODE_ENV: true,
    FHIR_BASE_URL: true,
    JWT_JWKS_URI: true,
    JWT_ISSUER: true,
    REDIS_URL: true,
    RATE_LIMIT_PER_MINUTE: true,
  })
  .extend({
    PORT: z.coerce.number().int().positive().default(3004),
    FHIR_CLIENT_ID: z.string().min(1).optional(),
    FHIR_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .refine((env) => (env.FHIR_CLIENT_ID === undefined) === (env.FHIR_CLIENT_SECRET === undefined), {
    message: 'FHIR_CLIENT_ID and FHIR_CLIENT_SECRET must be set together',
    path: ['FHIR_CLIENT_SECRET'],
  });

export type PatientServiceEnv = z.infer<typeof patientServiceEnvSchema>;

export function parsePatientServiceEnv(source: NodeJS.ProcessEnv): PatientServiceEnv {
  return patientServiceEnvSchema.parse(source);
}
