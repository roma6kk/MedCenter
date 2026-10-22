/**
 * register-schema — client validation of `RegisterPatientDto` (api-designer-spec §2.2.6) with the same limits as the
 * server (`contracts.ts` holds them). Messages are `validation.*` message keys, translated where they are shown.
 */
import { z } from 'zod';
import { ACCOUNT_CONSENT_VERSION, EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PASSWORD_PATTERN, isCalendarDate } from '@/lib/contracts';

const REQUIRED = { message: 'validation.required' } as const;
const TOO_LONG = { message: 'validation.tooLong' } as const;
const WEAK_PASSWORD = { message: 'validation.passwordStrength' } as const;

function requiredText(max: number): z.ZodString {
  return z.string().trim().min(1, REQUIRED).max(max, TOO_LONG);
}

export const registerFormSchema = z.object({
  email: z.string().trim().min(1, REQUIRED).max(EMAIL_MAX, TOO_LONG).email({ message: 'validation.email' }),
  firstName: requiredText(NAME_MAX),
  lastName: requiredText(NAME_MAX),
  password: z.string().min(1, REQUIRED).min(PASSWORD_MIN, WEAK_PASSWORD).max(PASSWORD_MAX, TOO_LONG).regex(PASSWORD_PATTERN, WEAK_PASSWORD),
  birthDate: z.string().min(1, REQUIRED).refine(isCalendarDate, { message: 'validation.date' }),
  // A native <select> reports "not specified" as an empty string.
  gender: z.enum(['', 'male', 'female']),
  // Consent to the processing of the account data (art. 5, Law 99-Z); it is not the consent to the electronic record.
  accountConsent: z.boolean().refine((accepted) => accepted, { message: 'validation.consentRequired' }),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** `RegisterPatientDto` as the API takes it: names and email trimmed, "not specified" left out. */
export interface RegisterRequest {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly birthDate: string;
  readonly gender?: 'male' | 'female';
  readonly accountConsent: { readonly accepted: true; readonly textVersion: string };
}

export function toRegisterRequest(values: RegisterFormValues): RegisterRequest {
  const { gender, accountConsent: _accepted, ...rest } = values;
  const request = { ...rest, accountConsent: { accepted: true, textVersion: ACCOUNT_CONSENT_VERSION } } as const;
  return gender === '' ? request : { ...request, gender };
}

/** Form fields the server may report errors for; anything else goes to the banner. */
export const REGISTER_FIELDS: ReadonlyArray<string> = ['email', 'firstName', 'lastName', 'password', 'birthDate', 'gender', 'accountConsent', 'accountConsent.accepted', 'accountConsent.textVersion'];
