import { APPOINTMENT_CANCEL_REASON_SYSTEM, isAppointmentCancelReasonCode, type AppointmentCancelReasonCode } from '@medcenter/contracts';
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
  readonly cancelReason?: AppointmentCancelReasonCode;
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

function participantId(appointment: FhirResource, resourceType: string): string {
  const participants = (appointment['participant'] as Participant[] | undefined) ?? [];
  const match = participants.find((p) => {
    const reference = p.actor?.reference;
    return typeof reference === 'string' && reference.startsWith(`${resourceType}/`);
  });
  return idOf(match?.actor?.reference);
}

/** Free text written before the codes existed is never passed on: it reads as `other`. */
function cancelReasonOf(appointment: FhirResource): AppointmentCancelReasonCode | undefined {
  const cancelation = appointment['cancelationReason'] as { coding?: Array<{ system?: unknown; code?: unknown }> } | undefined;
  if (cancelation === undefined || cancelation === null) {
    return undefined;
  }
  const code = cancelation.coding?.find((coding) => coding.system === APPOINTMENT_CANCEL_REASON_SYSTEM)?.code;
  return isAppointmentCancelReasonCode(code) ? code : 'other';
}

export function toAppointmentResponseDto(appointment: FhirResource): AppointmentResponseDto {
  const slots = (appointment['slot'] as Array<{ reference?: unknown }> | undefined) ?? [];

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
    cancelReason: cancelReasonOf(appointment),
    createdAt: readString(appointment, 'created') ?? '',
  };
}
