import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type ExternalResourceType = 'Patient' | 'PractitionerRole';

/**
 * FHIR bridge: links a local `User` to at most one `Patient` and at most one
 * `PractitionerRole` in HAPI (enforced by the unique index on
 * `(user_id, resource_type)` in migration `1700000000000-Init`).
 */
@Entity({ name: 'external_link', schema: 'auth' })
@Unique('uq_external_link_user_id_resource_type', ['userId', 'resourceType'])
export class ExternalLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ length: 100, name: 'resource_type' })
  resourceType!: ExternalResourceType;

  @Column({ length: 64, name: 'resource_id' })
  resourceId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
