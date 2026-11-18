type DiagnosisVerification = 'working' | 'provisional' | 'confirmed';

export interface DiagnosisView {
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: DiagnosisVerification;
}

interface CodingView {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly date: string;
  readonly endDate?: string;
  readonly status: string;
  readonly diagnosis: string;
  readonly diagnoses: ReadonlyArray<DiagnosisView>;
  readonly summary?: string;
  readonly recommendations?: string;
  readonly serviceType?: CodingView;
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

export interface AccountConsent {
  readonly at: string;
  readonly version: string;
}

export interface AccountProfile {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly name?: string;
  readonly isActive: boolean;
  readonly createdAt?: string;
  readonly accountConsent?: AccountConsent | null;
}

export interface ContactPoint {
  readonly system: string;
  readonly value: string;
  readonly use?: string;
}

export interface PatientProfile {
  readonly id: string;
  readonly version?: string;
  readonly active: boolean;
  readonly fullName: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly middleName?: string;
  readonly birthDate?: string;
  readonly gender?: 'male' | 'female' | 'other' | 'unknown';
  readonly photoUrl?: string;
  readonly telecom: ReadonlyArray<ContactPoint>;
}
