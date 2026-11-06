import type { PaginatedResponse } from '@/lib/api/pagination';

export type AppointmentState = 'booked' | 'cancelled' | 'noshow' | 'fulfilled';

export interface JournalAppointment {
  readonly id: string;
  readonly status: AppointmentState;
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
  readonly doctorName?: string;
  readonly serviceName?: string;
  readonly patientName?: string;
}

export type DoctorJournalPage = PaginatedResponse<JournalAppointment>;

export interface Coding {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

export interface Telecom {
  readonly system: string;
  readonly value: string;
  readonly use?: string;
}

export type Gender = 'male' | 'female' | 'other' | 'unknown';

export interface PatientCard {
  readonly id: string;
  readonly active: boolean;
  readonly fullName: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly middleName?: string;
  readonly birthDate?: string;
  readonly gender?: Gender;
  readonly telecom: ReadonlyArray<Telecom>;
}

export interface RelatedPerson {
  readonly id: string;
  readonly patientId: string;
  readonly active: boolean;
  readonly fullName: string;
  readonly relationship: ReadonlyArray<Coding>;
  readonly gender?: Gender;
  readonly birthDate?: string;
  readonly telecom: ReadonlyArray<Telecom>;
}

export type VerificationStatus = 'working' | 'provisional' | 'confirmed';

export interface DiagnosisView {
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: VerificationStatus;
}

export interface HistoryItem {
  readonly id: string;
  readonly date: string;
  readonly endDate?: string;
  readonly status: string;
  readonly diagnosis: string;
  readonly diagnoses: ReadonlyArray<DiagnosisView>;
  readonly summary?: string;
  readonly recommendations?: string;
  readonly serviceType?: Coding;
  readonly appointmentId: string;
  readonly practitionerRoleId: string;
  readonly doctorName?: string;
}

interface PrescriptionBase {
  readonly id: string;
  readonly status: string;
  readonly authoredOn?: string;
  readonly encounterId?: string;
  readonly note?: string;
}

export interface MedicationPrescription extends PrescriptionBase {
  readonly kind: 'medication';
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
}

export interface ServicePrescription extends PrescriptionBase {
  readonly kind: 'service';
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
}

export type Prescription = MedicationPrescription | ServicePrescription;

export type EncounterState = 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled' | 'entered-in-error' | 'unknown';

export interface ObservationView {
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
  readonly value: number;
  readonly unit: string;
}

export interface ServiceRequestView {
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
  readonly note?: string;
}

export interface MedicationRequestView {
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
  readonly note?: string;
}

export interface EncounterSummary {
  readonly id: string;
  readonly status: EncounterState;
  readonly period: { readonly start: string; readonly end?: string };
  readonly diagnosisCodes: ReadonlyArray<string>;
  readonly appointmentId: string;
  readonly patientId: string;
  readonly practitionerRoleId: string;
}

export interface EncounterDetails extends EncounterSummary {
  readonly serviceType?: Coding;
  readonly summary?: string;
  readonly recommendations?: string;
  readonly diagnoses: ReadonlyArray<DiagnosisView>;
  readonly observations: ReadonlyArray<ObservationView>;
  readonly serviceRequests: ReadonlyArray<ServiceRequestView>;
  readonly medicationRequests: ReadonlyArray<MedicationRequestView>;
}

export type SlotState = 'free' | 'busy' | 'entered-in-error';

export interface ScheduleSlot {
  readonly id: string;
  readonly scheduleId: string;
  readonly start: string;
  readonly end: string;
  readonly status: SlotState;
  readonly label: string;
}

export type WeekDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface WeeklyWindow {
  readonly dayOfWeek: WeekDay;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ScheduleSummary {
  readonly id: string;
  readonly isActive: boolean;
  readonly roomId?: string;
  readonly serviceId?: string;
  readonly horizonFrom?: string;
  readonly horizonTo?: string;
  readonly slotDurationMin?: number;
  readonly windows: ReadonlyArray<WeeklyWindow>;
  readonly comment?: string;
}

export interface DoctorScheduleResponse {
  readonly practitionerRoleId: string;
  readonly from: string;
  readonly to: string;
  readonly schedules: ReadonlyArray<ScheduleSummary>;
  readonly items: ReadonlyArray<ScheduleSlot>;
  readonly truncated?: true;
}

export interface Term {
  readonly system: string;
  readonly code: string;
  readonly display?: string;
}

export interface Expansion {
  readonly valueSet: string;
  readonly total: number;
  readonly items: ReadonlyArray<Term>;
}
