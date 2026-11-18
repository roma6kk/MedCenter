import { z } from 'zod';
import { CANCEL_REASON_CODES, cancelAppointmentSchema } from '@/lib/contracts';

export const cancelReasonSchema = cancelAppointmentSchema.extend({
  reason: z.enum(CANCEL_REASON_CODES, { message: 'appointments.reasonRequired' }),
});

export type CancelReasonForm = z.infer<typeof cancelReasonSchema>;
