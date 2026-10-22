import { Logger, type Provider } from '@nestjs/common';
import { envSchema } from '@medcenter/config';
import { assertActiveConsent, findActiveConsent, type FhirClient } from '@medcenter/fhir';

/** `warn` logs a missing consent and lets the request through, `block` answers 409 (ADR-019). */
export type ConsentEnforcement = 'warn' | 'block';

export const CONSENT_ENFORCEMENT_MODE = Symbol('CONSENT_ENFORCEMENT_MODE');

/** Only the key this service enforces; parsed at provider creation, so a bad value fails the boot. */
const consentEnvSchema = envSchema.pick({ CONSENT_ENFORCEMENT: true });

export const consentEnforcementProvider: Provider = {
  provide: CONSENT_ENFORCEMENT_MODE,
  useFactory: (): ConsentEnforcement => consentEnvSchema.parse(process.env).CONSENT_ENFORCEMENT,
};

export interface ConsentCheck {
  /** The request proceeds without a consent because of `emergencyReason`: the caller must write the audit. */
  readonly bypass: boolean;
}

const logger = new Logger('ConsentGate');

/**
 * API §7.1/7.3 consent rule (ADR-019). Runs before terminology validation and
 * before the write transaction. A consent in force always passes. Without one:
 * an `emergencyReason` bypasses the refusal (the caller records it as an
 * AuditEvent in the same transaction); otherwise `block` answers `409
 * CONSENT_REQUIRED` and `warn` logs it.
 */
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
    // Reuses the shared refusal so the error contract has one source.
    await assertActiveConsent(fhir, patientId);
  }
  logger.warn({ patientId }, 'patient has no active consent to the electronic medical record (CONSENT_ENFORCEMENT=warn)');
  return { bypass: false };
}
