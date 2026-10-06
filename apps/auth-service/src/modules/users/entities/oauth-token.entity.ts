import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Persisted authorization codes and refresh tokens. A consumed/rotated token
 * row is deleted and its `jti` lands in the Redis denylist (Task 6), which is
 * what makes `TOKEN_REVOKED` detectable.
 */
@Entity({ name: 'oauth_token', schema: 'auth' })
export class OAuthToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Unique token identifier (`jti` claim) — the revocation handle. */
  @Column({ unique: true, length: 100 })
  jti!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'client_id', length: 100 })
  clientId!: string;

  @Column({ length: 20 })
  kind!: 'code' | 'refresh';

  /** Space-separated SMART scopes granted with this token. */
  @Column({ length: 500, default: '' })
  scope!: string;

  /** S256 code challenge for `code` rows; empty for `refresh` rows. */
  @Column({ name: 'code_challenge', length: 128, default: '' })
  codeChallenge!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
