import { z } from 'zod';

export const EMAIL_MAX = 255;
export const NAME_MAX = 100;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** `auth.user.account_consent_version` is `varchar(64)`; the server refuses a longer text version. */
export const ACCOUNT_CONSENT_VERSION_MAX = 64;

/** Version of the account-consent text shown on the registration form (`auth.register.consent*`); bump it with the text. */
export const ACCOUNT_CONSENT_VERSION = '2026-10';

/** Consent to the electronic record (api-designer-spec §3.4–3.11, ADR-019): limits of the clerk's form and of the scan. */
export const CONSENT_FORM_NUMBER_MAX = 64;
export const CONSENT_SIGNED_BY_MAX = 200;
export const CONSENT_REPRESENTATIVE_DOCUMENT_MAX = 500;
export const CONSENT_SCAN_CONTENT_TYPES: ReadonlyArray<string> = ['application/pdf', 'image/jpeg', 'image/png'];
export const CONSENT_SCAN_MAX_BYTES = 10 * 1024 * 1024;
/** `emergencyReason` of 7.1 / 7.3: why the patient could not give the consent. */
export const EMERGENCY_REASON_MIN = 10;
export const EMERGENCY_REASON_MAX = 500;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/**
 * Mirrors class-validator `IsStrongPassword` (validator.js): letters and digits are ASCII only, and a "symbol" is one of
 * this fixed ASCII set. Cyrillic letters or emoji do NOT count as a symbol, so a password without one of these is
 * rejected by the server (400) even though a looser client rule would have accepted it.
 */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]).+$/;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that is a real calendar day (the server runs `IsDateString({ strict: true })`). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Belarus phone as the server stores it (`libs/contracts` phone.ts): `+375` and nine digits. */
export const BELARUS_PHONE_PATTERN = /^\+375\d{9}$/;

/** The number as `+375XXXXXXXXX` (spaces, dashes and parentheses dropped), or `null` when it is not a Belarus number. */
export function normaliseBelarusPhone(input: string): string | null {
  const compact: string = input.replace(/[\s\-()]/g, '');
  return BELARUS_PHONE_PATTERN.test(compact) ? compact : null;
}

export const registerPatientSchema = z.object({
  email: z.string().email().max(EMAIL_MAX),
  firstName: z.string().min(1).max(NAME_MAX),
  lastName: z.string().min(1).max(NAME_MAX),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).regex(PASSWORD_PATTERN),
  birthDate: z.string().refine(isCalendarDate),
  gender: z.enum(['male', 'female']).optional(),
  phone: z.string().regex(BELARUS_PHONE_PATTERN).optional(),
  /** Consent to the processing of the account data (art. 5, Law 99-Z); not the consent to the electronic record. */
  accountConsent: z.object({ accepted: z.literal(true), textVersion: z.string().min(1).max(ACCOUNT_CONSENT_VERSION_MAX) }),
});

export type RegisterPatientForm = z.infer<typeof registerPatientSchema>;

export const cancelAppointmentSchema = z.object({
  reason: z.string().min(REASON_MIN).max(REASON_MAX),
});

export type CancelAppointmentForm = z.infer<typeof cancelAppointmentSchema>;

/** Same grammar as the server's `libs/terminology` guards (`isValidIcd10Code`, `isValidAtcCode`): J06, J06.9, J06.99 / J01FA, J01FA10. */
export const ICD10_PATTERN = /^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/;
export const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$/;

export const SUMMARY_MIN = 3;
export const SUMMARY_MAX = 4000;
export const RECOMMENDATIONS_MIN = 3;
export const RECOMMENDATIONS_MAX = 2000;
export const DIAGNOSES_MAX = 20;
export const OBSERVATIONS_MAX = 50;
export const SERVICE_REQUESTS_MAX = 20;
export const MEDICATION_REQUESTS_MAX = 20;

export const OBSERVATION_CODE_SYSTEM_DEFAULT = 'https://fhir.by/CodeSystem/nsi-observations';
export const SERVICE_CODE_SYSTEM_DEFAULT = 'https://fhir.by/CodeSystem/nsi-services';

export const UCUM_UNITS: ReadonlyArray<string> = ['Cel', 'mg', 'g', 'mL', 'mmol/L', 'mg/dL'];

export const completeEncounterSchema = z.object({
  summary: z.string().min(SUMMARY_MIN).max(SUMMARY_MAX),
  diagnoses: z
    .array(
      z.object({
        code: z.string().regex(ICD10_PATTERN),
        display: z.string().min(1).max(500),
        verificationStatus: z.preprocess(
          (value) => (value === '' ? undefined : value),
          z.enum(['working', 'provisional', 'confirmed']).optional(),
        ),
      }),
    )
    .min(1)
    .max(DIAGNOSES_MAX),
  recommendations: z.string().min(RECOMMENDATIONS_MIN).max(RECOMMENDATIONS_MAX),
  observations: z
    .array(
      z.object({
        codeSystem: z.string().min(1).max(255),
        code: z.string().min(1).max(50),
        value: z.number().min(-50).max(300),
        unit: z.string().min(1).max(20),
      }),
    )
    .max(OBSERVATIONS_MAX)
    .default([]),
  serviceRequests: z
    .array(
      z.object({
        codeSystem: z.string().min(1).max(255),
        code: z.string().min(1).max(50),
        note: z.preprocess((value) => (value === '' ? undefined : value), z.string().max(500).optional()),
      }),
    )
    .max(SERVICE_REQUESTS_MAX)
    .default([]),
  medicationRequests: z
    .array(
      z.object({
        atcCode: z.string().regex(ATC_PATTERN),
        dosageText: z.string().min(3).max(1000),
        note: z.preprocess((value) => (value === '' ? undefined : value), z.string().max(500).optional()),
      }),
    )
    .max(MEDICATION_REQUESTS_MAX)
    .default([]),
});

export type CompleteEncounterForm = z.infer<typeof completeEncounterSchema>;
