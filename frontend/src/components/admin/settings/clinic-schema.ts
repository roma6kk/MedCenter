import { z } from 'zod';
import { normaliseBelarusPhone } from '@/lib/contracts';

export const clinicSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  phone: z.string().trim().max(30, 'validation.tooLong').refine((value) => normaliseBelarusPhone(value) !== null, { message: 'validation.phone' }),
  email: z.string().trim().min(1, 'validation.required').email('validation.email').max(255, 'validation.tooLong'),
  address: z.string().trim().min(1, 'validation.required').max(300, 'validation.tooLong'),
  hours: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
});

export type ClinicFormValues = z.infer<typeof clinicSchema>;
