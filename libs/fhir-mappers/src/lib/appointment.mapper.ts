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

interface Participant {
  readonly actor?: { readonly reference?: unknown };
}

function idOf(reference: unknown): string {
  return typeof reference === 'string' ? reference.split('/').pop() ?? '' : '';
}

function readString(resource: FhirResource, key: string): string | undefined {
  const value = resource[key];
  return typeof value === 'string' ? value : undefined;
}

/** Id of the first participant whose actor is of the given resource type (`Patient`, `PractitionerRole`, …). */
function participantId(appointment: FhirResource, resourceType: string): string {
  const participants = (appointment['participant'] as Participant[] | undefined) ?? [];
  const match = participants.find((p) => {
    const reference = p.actor?.reference;
    return typeof reference === 'string' && reference.startsWith(`${resourceType}/`);
  });
  return idOf(match?.actor?.reference);
}

/** FHIR `Appointment` -> `AppointmentResponseDto` (ADR-002 mapper pair). */
export function toAppointmentResponseDto(appointment: FhirResource): AppointmentResponseDto {
  const slots = (appointment['slot'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const reasons = (appointment['reasonCode'] as Array<{ text?: unknown }> | undefined) ?? [];
  const cancelation = appointment['cancelationReason'] as { text?: unknown } | undefined;
  const reasonText = reasons[0]?.text;
  const cancelText = cancelation?.text;

  return {
    id: appointment.id ?? '',
    status: (readString(appointment, 'status') as AppointmentResponseDto['status']) ?? 'booked',
    start: readString(appointment, 'start') ?? '',
    end: readString(appointment, 'end') ?? '',
    slotId: idOf(slots[0]?.reference),
    patientId: participantId(appointment, 'Patient'),
    doctorId: participantId(appointment, 'Practitioner'),
    practitionerRoleId: participantId(appointment, 'PractitionerRole'),
    serviceId: participantId(appointment, 'HealthcareService'),
    reason: typeof reasonText === 'string' ? reasonText : undefined,
    cancelReason: typeof cancelText === 'string' ? cancelText : undefined,
    createdAt: readString(appointment, 'created') ?? '',
  };
}
