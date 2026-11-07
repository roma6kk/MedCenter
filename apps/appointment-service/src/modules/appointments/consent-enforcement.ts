import type { Provider } from '@nestjs/common';
import { envSchema } from '@medcenter/config';

export type ConsentEnforcement = 'warn' | 'block';

export const CONSENT_ENFORCEMENT_MODE = Symbol('CONSENT_ENFORCEMENT_MODE');

const consentEnvSchema = envSchema.pick({ CONSENT_ENFORCEMENT: true });

export const consentEnforcementProvider: Provider = {
  provide: CONSENT_ENFORCEMENT_MODE,
  useFactory: (): ConsentEnforcement => consentEnvSchema.parse(process.env).CONSENT_ENFORCEMENT,
};
