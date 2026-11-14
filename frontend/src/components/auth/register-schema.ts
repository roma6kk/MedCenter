import { z } from 'zod';
import { ageInYears } from '@/lib/clinic-time';
import { ACCOUNT_CONSENT_VERSION, EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PASSWORD_PATTERN, isCalendarDate, normaliseBelarusPhone } from '@/lib/contracts';

export const ADULT_AGE_YEARS = 18;

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
  birthDate: z.string().min(1, REQUIRED).refine(isCalendarDate, { message: 'validation.date' }).refine((value) => !isCalendarDate(value) || (ageInYears(value) ?? ADULT_AGE_YEARS) >= ADULT_AGE_YEARS, { message: 'validation.ageRestricted' }),
  gender: z.enum(['', 'male', 'female']),
  phone: z.string().trim().refine((value) => value === '' || normaliseBelarusPhone(value) !== null, { message: 'validation.phone' }),
  accountConsent: z.boolean().refine((accepted) => accepted, { message: 'validation.consentRequired' }),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export interface RegisterRequest {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly birthDate: string;
  readonly gender?: 'male' | 'female';
  readonly phone?: string;
  readonly accountConsent: { readonly accepted: true; readonly textVersion: string };
}

export function toRegisterRequest(values: RegisterFormValues): RegisterRequest {
  const { gender, phone, accountConsent: _accepted, ...rest } = values;
  const request = { ...rest, accountConsent: { accepted: true, textVersion: ACCOUNT_CONSENT_VERSION } } as const;
  const normalised: string | null = normaliseBelarusPhone(phone);
  return { ...request, ...(gender === '' ? {} : { gender }), ...(normalised === null ? {} : { phone: normalised }) };
}

export const REGISTER_FIELDS: ReadonlyArray<string> = ['email', 'firstName', 'lastName', 'password', 'birthDate', 'gender', 'phone', 'accountConsent', 'accountConsent.accepted', 'accountConsent.textVersion'];
