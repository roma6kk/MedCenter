import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

/**
 * Read-side `AppointmentResponseDto` (API §6.2/6.3/6.5) plus display names the
 * client renders without extra round trips. The names come from the same FHIR
 * search (`_include`), so they are absent — not wrong — when a related resource
 * is missing.
 */
export interface AppointmentViewDto extends AppointmentResponseDto {
  /** `Practitioner.name` of the PractitionerRole participant. */
  readonly doctorName?: string;
  /** `HealthcareService.name` of the service participant. */
  readonly serviceName?: string;
  /** `Patient.name` of the patient participant. */
  readonly patientName?: string;
}
