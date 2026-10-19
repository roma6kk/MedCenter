/**
 * service-schema — the service (HealthcareService) form, limits of `CreateServiceDto` (api-designer-spec §5.1.3):
 * name ≤ 200, typeSystem ≤ 255, typeCode ≤ 50, duration 5…240 min, description ≤ 2000. Messages are message KEYS.
 *
 * `specialtyCodes` of the DTO is not on the form: catalog-service accepts it and drops it (`services.service.ts` never reads
 * it), so a field for it would say «created» and save nothing. It returns with the backend implementation.
 */
import { z } from 'zod';
import { SERVICE_CODE_SYSTEM_DEFAULT } from '@/lib/contracts';
import type { AdminService, ServicePayload } from './service-types';

export const DURATION_MIN = 5;
export const DURATION_MAX = 240;

function isDurationInRange(value: string): boolean {
  const minutes = Number(value);
  return /^\d+$/.test(value) && minutes >= DURATION_MIN && minutes <= DURATION_MAX;
}

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  typeSystem: z.string().trim().min(1, 'validation.required').max(255, 'validation.tooLong'),
  typeCode: z.string().trim().min(1, 'validation.required').max(50, 'validation.tooLong'),
  defaultDurationMin: z.string().refine(isDurationInRange, 'admin.services.validation.duration'),
  description: z.string().max(2000, 'validation.tooLong'),
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;

export const EMPTY_SERVICE_VALUES: ServiceFormValues = {
  name: '',
  typeSystem: SERVICE_CODE_SYSTEM_DEFAULT,
  typeCode: '',
  defaultDurationMin: '30',
  description: '',
};

export function serviceValuesOf(service: AdminService): ServiceFormValues {
  return {
    name: service.name,
    typeSystem: service.typeSystem,
    typeCode: service.typeCode,
    defaultDurationMin: String(service.defaultDurationMin),
    description: service.description ?? '',
  };
}

/**
 * The body of `POST`/`PATCH /admin/services`. An edit always sends the description (an empty one clears it); a create
 * leaves empty optional fields out.
 */
export function toServicePayload(values: ServiceFormValues, isEdit: boolean): ServicePayload {
  return {
    name: values.name.trim(),
    typeSystem: values.typeSystem.trim(),
    typeCode: values.typeCode.trim(),
    defaultDurationMin: Number(values.defaultDurationMin),
    ...(values.description === '' && !isEdit ? {} : { description: values.description }),
  };
}
