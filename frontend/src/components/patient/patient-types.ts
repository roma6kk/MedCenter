/**
 * patient-types — the answers of the patient's own read endpoints, as the services send them (api-designer-spec §2.2.7,
 * §3.1, §7.6, §7.7). Optional fields are omitted by the server, not `null`.
 */

export type DiagnosisVerification = 'working' | 'provisional' | 'confirmed';

export interface DiagnosisView {
  /** ICD-10 code, e.g. `J06.9`. */
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: DiagnosisVerification;
}

export interface CodingView {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

/** One finished visit of `GET /me/history` (7.6). */
export interface HistoryEntry {
  /** Encounter id. */
  readonly id: string;
  /** Start of the visit, RFC 3339 UTC. */
  readonly date: string;
  readonly endDate?: string;
  readonly status: string;
  /** Primary ICD-10 code; `''` when the visit has no diagnosis. */
  readonly diagnosis: string;
  readonly diagnoses: ReadonlyArray<DiagnosisView>;
  readonly summary?: string;
  readonly recommendations?: string;
  readonly serviceType?: CodingView;
  readonly appointmentId: string;
  readonly practitionerRoleId: string;
  /** Display name of the treating doctor (family name first); absent when the server could not resolve it. */
  readonly doctorName?: string;
}

interface PrescriptionBase {
  readonly id: string;
  /** FHIR request status: `active`, `completed`, `cancelled`, … */
  readonly status: string;
  /** RFC 3339 UTC. */
  readonly authoredOn?: string;
  readonly encounterId?: string;
  readonly note?: string;
}

/** A drug (`MedicationRequest`): ATC code and dosage (BR-009). */
export interface MedicationPrescription extends PrescriptionBase {
  readonly kind: 'medication';
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
}

/** A referral or procedure (`ServiceRequest`): a code of the national catalogue, no ATC code. */
export interface ServicePrescription extends PrescriptionBase {
  readonly kind: 'service';
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
}

/** `GET /me/prescriptions` (7.7) mixes both kinds in one list: `kind` tells them apart. */
export type Prescription = MedicationPrescription | ServicePrescription;

/** `GET /me` (2.2.7): the caller's account. */
export interface AccountProfile {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** «Фамилия Имя» as the account shows it. */
  readonly name?: string;
  readonly isActive: boolean;
  /** RFC 3339 UTC. */
  readonly createdAt?: string;
}

export interface ContactPoint {
  /** FHIR `ContactPoint.system`: `email`, `phone`, … */
  readonly system: string;
  readonly value: string;
  readonly use?: string;
}

/** `GET /me/patient` (3.1): the FHIR `Patient` of the caller. */
export interface PatientProfile {
  readonly id: string;
  readonly active: boolean;
  readonly fullName: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly middleName?: string;
  /** FHIR `date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly birthDate?: string;
  readonly gender?: 'male' | 'female' | 'other' | 'unknown';
  readonly photoUrl?: string;
  readonly telecom: ReadonlyArray<ContactPoint>;
}
