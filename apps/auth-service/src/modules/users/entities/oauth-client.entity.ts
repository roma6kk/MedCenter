import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'oauth_client', schema: 'auth' })
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', unique: true, length: 100 })
  clientId!: string;

  @Column({ name: 'client_secret_hash', length: 255, default: '' })
  clientSecretHash!: string;

  @Column({ name: 'redirect_uris', type: 'text' })
  redirectUris!: string;

  @Column({ length: 500, default: '' })
  scope!: string;

  @Column({ name: 'is_public', default: true })
  isPublic!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
