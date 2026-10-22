import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'user', schema: 'auth' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column({ name: 'first_name', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', length: 100 })
  lastName!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** When the account holder agreed to the processing of the account data at self-registration (art. 5, Law 99-Z). */
  @Column({ name: 'account_consent_at', type: 'timestamptz', nullable: true })
  accountConsentAt!: Date | null;

  /** Version of the consent text shown at that moment. */
  @Column({ name: 'account_consent_version', type: 'varchar', length: 64, nullable: true })
  accountConsentVersion!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
