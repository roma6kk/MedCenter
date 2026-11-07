import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

export type AppointmentFactStatus = 'booked' | 'cancelled';

// Booked and cancelled travel on separate queues, so a cancellation may arrive first: it creates the row without start_at; the booking fills it without reviving the status.
@Entity({ name: 'appointment_fact', schema: ANALYTICS_SCHEMA })
export class AppointmentFactEntity {
  @PrimaryColumn({ name: 'appointment_id', type: 'varchar', length: 64 })
  appointmentId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: AppointmentFactStatus;

  @Column({ name: 'patient_ref', type: 'varchar', length: 128, nullable: true })
  patientRef!: string | null;

  @Column({ name: 'practitioner_role_ref', type: 'varchar', length: 128, nullable: true })
  practitionerRoleRef!: string | null;

  @Column({ name: 'service_id', type: 'varchar', length: 64, nullable: true })
  serviceId!: string | null;

  @Column({ name: 'slot_ref', type: 'varchar', length: 128, nullable: true })
  slotRef!: string | null;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'booked_at', type: 'timestamptz', nullable: true })
  bookedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_actor', type: 'varchar', length: 16, nullable: true })
  cancelActor!: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
