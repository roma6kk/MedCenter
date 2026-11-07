import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'oauth_token', schema: 'auth' })
export class OAuthToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 100 })
  jti!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'client_id', length: 100 })
  clientId!: string;

  @Column({ length: 20 })
  kind!: 'code' | 'refresh';

  @Column({ length: 500, default: '' })
  scope!: string;

  @Column({ name: 'code_challenge', length: 128, default: '' })
  codeChallenge!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
