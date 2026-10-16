import type { FieldSpec } from './smoke-assert';

/** Response shapes of specs/api-designer-spec.md, as the field specs the suite asserts. */

export const DOCTOR_SHAPE: FieldSpec = { id: 'string', name: 'string', firstName: 'string', lastName: 'string', specialty: 'string?', roomId: 'string?' };

export const SERVICE_SHAPE: FieldSpec = {
  id: 'string',
  name: 'string',
  typeSystem: 'string',
  typeCode: 'string',
  typeDisplay: 'string',
  defaultDurationMin: 'number',
  isActive: 'boolean',
};

export const ROOM_SHAPE: FieldSpec = { id: 'string', identifier: 'string', name: 'string', floor: 'number?', description: 'string?', isActive: 'boolean' };

export const ROOM_USAGE_SHAPE: FieldSpec = { roomId: 'string', inUse: 'boolean', truncated: 'boolean', items: 'array' };

/** API §5.2.8 `SlotResponseDto`. */
export const SLOT_SHAPE: FieldSpec = { id: 'string', scheduleId: 'string', start: 'string', end: 'string', status: 'string' };

export const DOCTOR_SLOTS_SHAPE: FieldSpec = { doctorId: 'string', from: 'string', to: 'string', items: 'array' };

export const DOCTOR_SCHEDULE_SHAPE: FieldSpec = { practitionerRoleId: 'string', from: 'string', to: 'string', schedules: 'array', items: 'array' };

/** API §6 `AppointmentResponseDto`. */
export const APPOINTMENT_SHAPE: FieldSpec = {
  id: 'string',
  status: 'string',
  start: 'string',
  end: 'string',
  slotId: 'string',
  patientId: 'string',
  doctorId: 'string',
  practitionerRoleId: 'string',
  serviceId: 'string',
  reason: 'string?',
  cancelReason: 'string?',
  createdAt: 'string',
};

export const APPOINTMENT_VIEW_SHAPE: FieldSpec = { ...APPOINTMENT_SHAPE, doctorName: 'string?', serviceName: 'string?', patientName: 'string?' };

/** API §7.3 `EncounterResponseDto`. */
export const ENCOUNTER_SHAPE: FieldSpec = {
  id: 'string',
  status: 'string',
  period: 'object',
  diagnosisCodes: 'array',
  appointmentId: 'string',
  patientId: 'string',
  practitionerRoleId: 'string',
};

export const ENCOUNTER_DETAILS_SHAPE: FieldSpec = {
  ...ENCOUNTER_SHAPE,
  summary: 'string?',
  recommendations: 'string?',
  diagnoses: 'array',
  observations: 'array',
  serviceRequests: 'array',
  medicationRequests: 'array',
};

export const HISTORY_ITEM_SHAPE: FieldSpec = { id: 'string', date: 'string', status: 'string', diagnosis: 'string', diagnoses: 'array', appointmentId: 'string' };

export const PRESCRIPTION_SHAPE: FieldSpec = { id: 'string', status: 'string', kind: 'string' };

export const PATIENT_SHAPE: FieldSpec = { id: 'string', active: 'boolean', fullName: 'string', birthDate: 'string?', gender: 'string?' };

export const USER_SHAPE: FieldSpec = {
  id: 'string',
  email: 'string',
  firstName: 'string',
  lastName: 'string',
  roles: 'array',
  isActive: 'boolean',
};

export const NOTIFICATION_SHAPE: FieldSpec = { id: 'string', category: 'string', text: 'string', sent: 'string', read: 'boolean' };

export const AUDIT_EVENT_SHAPE: FieldSpec = {
  id: 'string',
  occurredAt: 'string',
  userId: 'string',
  action: 'string',
  resourceType: 'string',
  resourceId: 'string',
  requestId: 'string',
};

export const VALUE_SET_SHAPE: FieldSpec = { url: 'string', name: 'string', title: 'string', version: 'string', status: 'string' };

export const MEASURE_REPORT_SHAPE: FieldSpec = { measure: 'string', scoring: 'string', period: 'object', total: 'number', groups: 'array' };

/** Admin view of a `Schedule` (API §5.2.1-5.2.3): the DTO, not the raw FHIR resource. */
export const SCHEDULE_SHAPE: FieldSpec = {
  id: 'string',
  isActive: 'boolean',
  practitionerRoleId: 'string',
  roomId: 'string',
  serviceId: 'string',
  horizonFrom: 'string',
  horizonTo: 'string',
  slotDurationMin: 'number',
  windows: 'array',
  comment: 'string?',
};

/** API §5.2.5 result. */
export const GENERATE_SHAPE: FieldSpec = { generated: 'number', skipped: 'number' };
