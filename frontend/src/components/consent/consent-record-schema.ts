import { z } from 'zod';
import {
  CONSENT_FORM_NUMBER_MAX,
  CONSENT_SCAN_CONTENT_TYPES,
  CONSENT_SCAN_MAX_BYTES,
  CONSENT_SIGNED_BY_MAX,
  isCalendarDate,
} from '@/lib/contracts';
import type { ConsentEntry, ConsentEntryStatus } from './consent-types';

const REQUIRED = { message: 'validation.required' } as const;
const TOO_LONG = { message: 'validation.tooLong' } as const;

export function validateScanFile(file: File | null | undefined): string | null {
  if (file === null || file === undefined) return 'validation.scanRequired';
  if (!CONSENT_SCAN_CONTENT_TYPES.includes(file.type)) return 'validation.scanType';
  return file.size > CONSENT_SCAN_MAX_BYTES ? 'validation.scanSize' : null;
}

export interface ConsentRecordValues {
  readonly formNumber: string;
  readonly signedAt: string;
  readonly status: ConsentEntryStatus;
  readonly signedByName: string;
  readonly file: File | null;
}

export function consentRecordSchema(role: 'ADMIN' | 'DOCTOR', today: string): z.ZodType<ConsentRecordValues> {
  return z
    .object({
      formNumber: z.string().trim().min(1, REQUIRED).max(CONSENT_FORM_NUMBER_MAX, TOO_LONG),
      signedAt: z.string().min(1, REQUIRED).refine(isCalendarDate, { message: 'validation.date' }).refine((day) => day <= today || !isCalendarDate(day), { message: 'validation.futureDate' }),
      status: z.enum(['active', 'rejected']),
      signedByName: z.string().trim().max(CONSENT_SIGNED_BY_MAX, TOO_LONG),
      file: z.custom<File | null>((value) => value === null || value instanceof File).nullable(),
    })
    .superRefine((values, context) => {
      const fileMessage: string | null = validateScanFile(values.file);
      if (fileMessage !== null) context.addIssue({ code: 'custom', path: ['file'], message: fileMessage });
      if (role === 'ADMIN' && values.signedByName === '') context.addIssue({ code: 'custom', path: ['signedByName'], message: 'validation.required' });
    }) as unknown as z.ZodType<ConsentRecordValues>;
}

export function toConsentEntry(values: ConsentRecordValues): ConsentEntry {
  const signedByName: string = values.signedByName.trim();
  if (values.file === null) throw new Error('A consent entry needs the scan');
  return {
    file: values.file,
    body: {
      status: values.status,
      formNumber: values.formNumber.trim(),
      signedAt: values.signedAt,
      consenterType: 'self',
      ...(signedByName === '' ? {} : { signedByName }),
    },
  };
}
