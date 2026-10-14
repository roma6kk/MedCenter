interface PrescriptionBaseDto {
  /** `MedicationRequest` / `ServiceRequest` id. */
  readonly id: string;
  readonly status: string;
  readonly authoredOn?: string;
  /** Encounter the prescription was made in (BR-005). */
  readonly encounterId?: string;
  /** Diagnosis (`Condition`) the prescription is for (BR-005). */
  readonly reasonConditionId?: string;
  readonly note?: string;
}

/** Drug prescription (`MedicationRequest`, ATC code, BR-009). */
export interface MedicationPrescriptionDto extends PrescriptionBaseDto {
  readonly kind: 'medication';
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
}

/** Referral / procedure order (`ServiceRequest`, НСИ code). */
export interface ServicePrescriptionDto extends PrescriptionBaseDto {
  readonly kind: 'service';
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
}

/** One item of API §7.5/7.7 — the patient's prescriptions (ServiceRequest/MedicationRequest). */
export type PrescriptionItemDto = MedicationPrescriptionDto | ServicePrescriptionDto;
