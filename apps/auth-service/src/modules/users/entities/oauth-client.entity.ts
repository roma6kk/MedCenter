import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'oauth_client', schema: 'auth' })
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', unique: true, length: 100 })
  clientId!: string;

  /** Bcrypt hash of the client secret; public clients store an empty string. */
  @Column({ name: 'client_secret_hash', length: 255, default: '' })
  clientSecretHash!: string;

  /** Comma-separated list of registered redirect URIs. */
  @Column({ name: 'redirect_uris', type: 'text' })
  redirectUris!: string;

  /** Space-separated SMART scopes granted to this client. */
  @Column({ length: 500, default: '' })
  scope!: string;

  @Column({ name: 'is_public', default: true })
  isPublic!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
