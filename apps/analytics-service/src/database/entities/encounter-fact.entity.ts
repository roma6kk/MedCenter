import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

/** Specialty code stored when the practitioner's specialty cannot be resolved. */
export const UNKNOWN_SPECIALTY_CODE = 'unknown';

/**
 * One row per completed encounter (`encounter.completed.v1`). The specialty is
 * resolved from HAPI once, at ingestion, so API §9.2 is a plain `GROUP BY`.
 */
@Entity({ name: 'encounter_fact', schema: ANALYTICS_SCHEMA })
export class EncounterFactEntity {
  @PrimaryColumn({ name: 'encounter_id', type: 'varchar', length: 64 })
  encounterId!: string;

  @Column({ name: 'patient_ref', type: 'varchar', length: 128 })
  patientRef!: string;

  @Column({ name: 'practitioner_ref', type: 'varchar', length: 128 })
  practitionerRef!: string;

  @Column({ name: 'specialty_system', type: 'varchar', length: 255, nullable: true })
  specialtySystem!: string | null;

  @Column({ name: 'specialty_code', type: 'varchar', length: 128, default: UNKNOWN_SPECIALTY_CODE })
  specialtyCode!: string;

  @Column({ name: 'specialty_display', type: 'varchar', length: 255, nullable: true })
  specialtyDisplay!: string | null;

  /** `occurredAt` of the event — the period dimension of API §9.2. */
  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;

  @Column({ name: 'diagnosis_count', type: 'integer', default: 0 })
  diagnosisCount!: number;
}
