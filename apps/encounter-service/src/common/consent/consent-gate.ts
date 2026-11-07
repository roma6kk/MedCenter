import { Logger, type Provider } from '@nestjs/common';
import { envSchema } from '@medcenter/config';
import { assertActiveConsent, findActiveConsent, type FhirClient } from '@medcenter/fhir';

export type ConsentEnforcement = 'warn' | 'block';

export const CONSENT_ENFORCEMENT_MODE = Symbol('CONSENT_ENFORCEMENT_MODE');

const consentEnvSchema = envSchema.pick({ CONSENT_ENFORCEMENT: true });

export const consentEnforcementProvider: Provider = {
  provide: CONSENT_ENFORCEMENT_MODE,
  useFactory: (): ConsentEnforcement => consentEnvSchema.parse(process.env).CONSENT_ENFORCEMENT,
};

export interface ConsentCheck {
  readonly bypass: boolean;
}

const logger = new Logger('ConsentGate');

export async function checkConsent(
  fhir: FhirClient,
  mode: ConsentEnforcement,
  patientId: string,
  emergencyReason: string | undefined,
): Promise<ConsentCheck> {
  if ((await findActiveConsent(fhir, patientId)) !== null) {
    return { bypass: false };
  }
  if (emergencyReason !== undefined) {
    return { bypass: true };
  }
  if (mode === 'block') {
    await assertActiveConsent(fhir, patientId);
  }
  logger.warn({ patientId }, 'patient has no active consent to the electronic medical record (CONSENT_ENFORCEMENT=warn)');
  return { bypass: false };
}
