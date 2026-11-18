import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

export interface AppointmentViewDto extends AppointmentResponseDto {
  readonly doctorName?: string;
  readonly serviceName?: string;
  readonly patientName?: string;
}
