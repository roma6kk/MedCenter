import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type ExternalResourceType = 'Patient' | 'PractitionerRole';

@Entity({ name: 'external_link', schema: 'auth' })
@Unique('uq_external_link_user_id_resource_type', ['userId', 'resourceType'])
@Index('uq_external_link_resource', ['resourceType', 'resourceId'], { unique: true })
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
