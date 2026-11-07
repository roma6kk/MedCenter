import { z } from 'zod';
import { SERVICE_CODE_SYSTEM_DEFAULT } from '@/lib/contracts';
import type { AdminService, ServicePayload } from './service-types';

const DURATION_MIN = 5;
const DURATION_MAX = 240;

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
  nameEn: z.string().max(200, 'validation.tooLong'),
  descriptionEn: z.string().max(2000, 'validation.tooLong'),
  isActive: z.boolean(),
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;

export const EMPTY_SERVICE_VALUES: ServiceFormValues = {
  name: '',
  typeSystem: SERVICE_CODE_SYSTEM_DEFAULT,
  typeCode: '',
  defaultDurationMin: '30',
  description: '',
  nameEn: '',
  descriptionEn: '',
  isActive: true,
};

export function serviceValuesOf(service: AdminService): ServiceFormValues {
  return {
    name: service.name,
    typeSystem: service.typeSystem,
    typeCode: service.typeCode,
    defaultDurationMin: String(service.defaultDurationMin),
    description: service.description ?? '',
    nameEn: service.nameEn ?? '',
    descriptionEn: service.descriptionEn ?? '',
    isActive: service.isActive,
  };
}

export function toServicePayload(values: ServiceFormValues, isEdit: boolean): ServicePayload {
  return {
    name: values.name.trim(),
    typeSystem: values.typeSystem.trim(),
    typeCode: values.typeCode.trim(),
    defaultDurationMin: Number(values.defaultDurationMin),
    ...(values.description === '' && !isEdit ? {} : { description: values.description }),
    ...(values.nameEn.trim() === '' && !isEdit ? {} : { nameEn: values.nameEn.trim() }),
    ...(values.descriptionEn.trim() === '' && !isEdit ? {} : { descriptionEn: values.descriptionEn.trim() }),
    ...(values.isActive && !isEdit ? {} : { isActive: values.isActive }),
  };
}
