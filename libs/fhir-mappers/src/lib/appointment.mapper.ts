import type { FhirResource } from '@medcenter/fhir';

export interface AppointmentResponseDto {
  readonly id: string;
  readonly status: 'booked' | 'cancelled' | 'noshow' | 'fulfilled';
  readonly start: string;
  readonly end: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly practitionerRoleId: string;
  readonly serviceId: string;
  readonly reason?: string;
  readonly cancelReason?: string;
  readonly createdAt: string;
}

function readReference(resource: FhirResource, key: string): string {
  const value = resource[key];
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const { reference } = value as { reference?: unknown };
  return typeof reference === 'string' ? reference.split('/').pop() ?? '' : '';
}

function readString(resource: FhirResource, key: string): string | undefined {
  const value = resource[key];
  return typeof value === 'string' ? value : undefined;
}

/** FHIR `Appointment` -> `AppointmentResponseDto` (ADR-002 mapper pair). */
export function toAppointmentResponseDto(appointment: FhirResource): AppointmentResponseDto {
  return {
    id: appointment.id ?? '',
    status: (readString(appointment, 'status') as AppointmentResponseDto['status']) ?? 'booked',
    start: readString(appointment, 'start') ?? '',
    end: readString(appointment, 'end') ?? '',
    slotId: readReference(appointment, 'slot'),
    patientId: '',
    doctorId: '',
    practitionerRoleId: '',
    serviceId: '',
    reason: readString(appointment, 'description'),
    cancelReason: readString(appointment, 'cancelationReason'),
    createdAt: readString(appointment, 'created') ?? '',
  };
}
