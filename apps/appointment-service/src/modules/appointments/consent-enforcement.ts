import type { Provider } from '@nestjs/common';
import { envSchema } from '@medcenter/config';

/** What a missing patient consent does to a free-text reason on booking (API §6.1, ADR-019). */
export type ConsentEnforcement = 'warn' | 'block';

export const CONSENT_ENFORCEMENT_MODE = Symbol('CONSENT_ENFORCEMENT_MODE');

/** Only the key this service enforces; parsed at provider creation, so a bad value fails the boot. */
const consentEnvSchema = envSchema.pick({ CONSENT_ENFORCEMENT: true });

export const consentEnforcementProvider: Provider = {
  provide: CONSENT_ENFORCEMENT_MODE,
  useFactory: (): ConsentEnforcement => consentEnvSchema.parse(process.env).CONSENT_ENFORCEMENT,
};
