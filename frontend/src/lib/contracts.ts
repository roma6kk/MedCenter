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

export const completeEncounterSchema = z.object({
  summary: z.string().min(1),
  diagnoses: z.array(z.object({ code: z.string().regex(ICD10_PATTERN), display: z.string().min(1) })).min(1),
  recommendations: z.string().optional(),
  serviceRequests: z.array(z.object({ code: z.string().min(1), display: z.string().min(1) })).default([]),
  medicationRequests: z
    .array(z.object({ atcCode: z.string().regex(ATC_PATTERN), dosageText: z.string().min(1), ucumUnit: z.string().min(1) }))
    .default([]),
});

export type CompleteEncounterForm = z.infer<typeof completeEncounterSchema>;
