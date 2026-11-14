import { z } from 'zod';
import { POLICY_VERSION } from './policy-version';

export const EMAIL_MAX = 255;
export const NAME_MAX = 100;

const ACCOUNT_CONSENT_VERSION_MAX = 64;

export const ACCOUNT_CONSENT_VERSION = POLICY_VERSION;

export const CONSENT_FORM_NUMBER_MAX = 64;
export const CONSENT_SIGNED_BY_MAX = 200;
export const CONSENT_REPRESENTATIVE_DOCUMENT_MAX = 500;
export const CONSENT_SCAN_CONTENT_TYPES: ReadonlyArray<string> = ['application/pdf', 'image/jpeg', 'image/png'];
export const CONSENT_SCAN_MAX_BYTES = 10 * 1024 * 1024;
export const EMERGENCY_REASON_MIN = 10;
export const EMERGENCY_REASON_MAX = 500;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// Mirrors class-validator IsStrongPassword: ASCII only, and a symbol is one of a fixed ASCII set (Cyrillic and emoji do not count).
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]).+$/;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const BELARUS_PHONE_PATTERN = /^\+375\d{9}$/;

export function normaliseBelarusPhone(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '');
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
  accountConsent: z.object({ accepted: z.literal(true), textVersion: z.string().min(1).max(ACCOUNT_CONSENT_VERSION_MAX) }),
});

export type RegisterPatientForm = z.infer<typeof registerPatientSchema>;

export const CANCEL_REASON_CODES = ['plans-changed', 'inconvenient-time', 'other-doctor', 'other'] as const;

export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

export function toCancelReasonCode(value: unknown): CancelReasonCode {
  return CANCEL_REASON_CODES.find((code) => code === value) ?? 'other';
}

export const cancelAppointmentSchema = z.object({
  reason: z.enum(CANCEL_REASON_CODES),
});

export type CancelAppointmentForm = z.infer<typeof cancelAppointmentSchema>;

export const ICD10_PATTERN = /^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/;
export const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$/;

const SUMMARY_MIN = 3;
const SUMMARY_MAX = 4000;
const RECOMMENDATIONS_MIN = 3;
export const RECOMMENDATIONS_MAX = 2000;
export const DIAGNOSES_MAX = 20;
export const OBSERVATIONS_MAX = 50;
export const SERVICE_REQUESTS_MAX = 20;
export const MEDICATION_REQUESTS_MAX = 20;

export const OBSERVATION_CODE_SYSTEM_DEFAULT = 'https://fhir.by/CodeSystem/nsi-observations';
export const SERVICE_CODE_SYSTEM_DEFAULT = 'https://fhir.by/CodeSystem/nsi-services';

export const UCUM_UNITS: ReadonlyArray<string> = ['Cel', 'mg', 'g', 'mL', 'mmol/L', 'mg/dL'];

export const completeEncounterSchema = z.object({
  summary: z.string().trim().min(SUMMARY_MIN).max(SUMMARY_MAX),
  diagnoses: z
    .array(
      z.object({
        code: z.string().regex(ICD10_PATTERN),
        display: z.string().trim().min(1).max(500),
        verificationStatus: z.preprocess(
          (value) => (value === '' ? undefined : value),
          z.enum(['working', 'provisional', 'confirmed']).optional(),
        ),
      }),
    )
    .min(1)
    .max(DIAGNOSES_MAX)
    .superRefine((diagnoses, context) => {
      const seen = new Set<string>();
      diagnoses.forEach((diagnosis, index) => {
        const code = diagnosis.code.trim().toUpperCase();
        if (seen.has(code)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'code'] });
        seen.add(code);
      });
    }),
  recommendations: z.string().trim().min(RECOMMENDATIONS_MIN).max(RECOMMENDATIONS_MAX),
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
        note: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().max(500).optional()),
      }),
    )
    .max(SERVICE_REQUESTS_MAX)
    .default([]),
  medicationRequests: z
    .array(
      z.object({
        atcCode: z.string().regex(ATC_PATTERN),
        dosageText: z.string().trim().min(3).max(1000),
        note: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().max(500).optional()),
      }),
    )
    .max(MEDICATION_REQUESTS_MAX)
    .default([]),
});

export type CompleteEncounterForm = z.infer<typeof completeEncounterSchema>;
