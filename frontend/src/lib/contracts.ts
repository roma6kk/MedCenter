import { z } from 'zod';

export const EMAIL_MAX = 255;
export const NAME_MAX = 100;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const registerPatientSchema = z.object({
  email: z.string().email().max(EMAIL_MAX),
  firstName: z.string().min(1).max(NAME_MAX),
  lastName: z.string().min(1).max(NAME_MAX),
  password: z.string().min(10).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type RegisterPatientForm = z.infer<typeof registerPatientSchema>;

export const cancelAppointmentSchema = z.object({
  reason: z.string().min(REASON_MIN).max(REASON_MAX),
});

export type CancelAppointmentForm = z.infer<typeof cancelAppointmentSchema>;

export const ICD10_PATTERN = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
export const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{1,2}([0-9]{2})?$/;

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
