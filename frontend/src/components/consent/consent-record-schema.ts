/**
 * consent-record-schema — client validation of the clerk's form that records a paper consent or a written refusal
 * (`CreateConsentDto`, api-designer-spec §3.8, and the scan of §3.10). The limits are the server's (`contracts.ts`); the
 * server still checks the scan by its signature. Messages are `validation.*` keys, translated where they are shown.
 */
import { z } from 'zod';
import {
  CONSENT_FORM_NUMBER_MAX,
  CONSENT_REPRESENTATIVE_DOCUMENT_MAX,
  CONSENT_SCAN_CONTENT_TYPES,
  CONSENT_SCAN_MAX_BYTES,
  CONSENT_SIGNED_BY_MAX,
  isCalendarDate,
} from '@/lib/contracts';
import type { ConsentEntry, ConsentEntryStatus, ConsenterType } from './consent-types';

const REQUIRED = { message: 'validation.required' } as const;
const TOO_LONG = { message: 'validation.tooLong' } as const;

/** Why a scan cannot be sent, as a `validation.*` key; `null` when it can. */
export function validateScanFile(file: File | null | undefined): string | null {
  if (file === null || file === undefined) return 'validation.scanRequired';
  if (!CONSENT_SCAN_CONTENT_TYPES.includes(file.type)) return 'validation.scanType';
  return file.size > CONSENT_SCAN_MAX_BYTES ? 'validation.scanSize' : null;
}

export interface ConsentRecordValues {
  readonly formNumber: string;
  readonly signedAt: string;
  readonly status: ConsentEntryStatus;
  readonly consenterType: ConsenterType;
  /** `''` while no person is chosen. */
  readonly relatedPersonId: string;
  readonly representativeDocument: string;
  readonly signedByName: string;
  readonly file: File | null;
}

/** `role` decides whether the signer's name is the clerk's to type (ADMIN) or the server's to fill in (DOCTOR). `today` is the clinic's day key. */
export function consentRecordSchema(role: 'ADMIN' | 'DOCTOR', today: string): z.ZodType<ConsentRecordValues> {
  return z
    .object({
      formNumber: z.string().trim().min(1, REQUIRED).max(CONSENT_FORM_NUMBER_MAX, TOO_LONG),
      signedAt: z.string().min(1, REQUIRED).refine(isCalendarDate, { message: 'validation.date' }).refine((day) => day <= today || !isCalendarDate(day), { message: 'validation.futureDate' }),
      status: z.enum(['active', 'rejected']),
      consenterType: z.enum(['self', 'legal-representative', 'guardian', 'relative']),
      relatedPersonId: z.string(),
      representativeDocument: z.string().trim().max(CONSENT_REPRESENTATIVE_DOCUMENT_MAX, TOO_LONG),
      signedByName: z.string().trim().max(CONSENT_SIGNED_BY_MAX, TOO_LONG),
      file: z.custom<File | null>((value) => value === null || value instanceof File).nullable(),
    })
    .superRefine((values, context) => {
      const fileMessage: string | null = validateScanFile(values.file);
      if (fileMessage !== null) context.addIssue({ code: 'custom', path: ['file'], message: fileMessage });
      if (role === 'ADMIN' && values.signedByName === '') context.addIssue({ code: 'custom', path: ['signedByName'], message: 'validation.required' });
      if (values.consenterType === 'self') return;
      if (values.relatedPersonId === '') context.addIssue({ code: 'custom', path: ['relatedPersonId'], message: 'validation.relatedRequired' });
      if (values.representativeDocument === '') context.addIssue({ code: 'custom', path: ['representativeDocument'], message: 'validation.required' });
    }) as unknown as z.ZodType<ConsentRecordValues>;
}

/** The 3.8 body (without the scan id) and the scan: text trimmed, what a self-signed consent does not have left out. */
export function toConsentEntry(values: ConsentRecordValues): ConsentEntry {
  const signedByName: string = values.signedByName.trim();
  const isSelf: boolean = values.consenterType === 'self';
  if (values.file === null) throw new Error('A consent entry needs the scan');
  return {
    file: values.file,
    body: {
      status: values.status,
      formNumber: values.formNumber.trim(),
      signedAt: values.signedAt,
      consenterType: values.consenterType,
      ...(isSelf ? {} : { relatedPersonId: values.relatedPersonId, representativeDocument: values.representativeDocument.trim() }),
      ...(signedByName === '' ? {} : { signedByName }),
    },
  };
}
