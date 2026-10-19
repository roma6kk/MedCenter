import { z } from 'zod';
import { REASON_MAX, REASON_MIN, cancelAppointmentSchema } from '@/lib/contracts';

/**
 * The cancellation form: the shared `CancelAppointmentDto` rule (3…500, API §6.4) on the trimmed text, because spaces do
 * not make a reason. The messages are `appointments.*` keys, translated where they are shown.
 */
export const cancelReasonSchema = cancelAppointmentSchema.extend({
  reason: z
    .string()
    .trim()
    .min(1, { message: 'appointments.reasonRequired' })
    .min(REASON_MIN, { message: 'appointments.reasonTooShort' })
    .max(REASON_MAX, { message: 'appointments.reasonTooLong' }),
});

export type CancelReasonForm = z.infer<typeof cancelReasonSchema>;
