interface PrescriptionBaseDto {
  readonly id: string;
  readonly status: string;
  readonly authoredOn?: string;
  readonly encounterId?: string;
  readonly reasonConditionId?: string;
  readonly note?: string;
}

export interface MedicationPrescriptionDto extends PrescriptionBaseDto {
  readonly kind: 'medication';
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
}

export interface ServicePrescriptionDto extends PrescriptionBaseDto {
  readonly kind: 'service';
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
}

export type PrescriptionItemDto = MedicationPrescriptionDto | ServicePrescriptionDto;
