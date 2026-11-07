import { z } from 'zod';
import { REASON_MAX, REASON_MIN, cancelAppointmentSchema } from '@/lib/contracts';

export const cancelReasonSchema = cancelAppointmentSchema.extend({
  reason: z
    .string()
    .trim()
    .min(1, { message: 'appointments.reasonRequired' })
    .min(REASON_MIN, { message: 'appointments.reasonTooShort' })
    .max(REASON_MAX, { message: 'appointments.reasonTooLong' }),
});

export type CancelReasonForm = z.infer<typeof cancelReasonSchema>;
