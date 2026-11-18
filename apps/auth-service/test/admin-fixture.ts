import type { INestApplication } from '@nestjs/common';

import { startAuthApp, type AuthApp } from './app-harness';
import { bearer, signIn, type TokenBody } from './auth-flow-helpers';

export const ADMIN = { email: 'admin@medcenter.by', password: 'Adm1n!Passw0rd' } as const;

export interface AdminFixture {
  readonly started: AuthApp;
  readonly app: INestApplication;
  readonly admin: TokenBody;
  readonly adminAuthorization: string;
  close(): Promise<void>;
}

export async function startWithAdmin(): Promise<AdminFixture> {
  process.env['BOOTSTRAP_ADMIN_EMAIL'] = ADMIN.email;
  process.env['BOOTSTRAP_ADMIN_PASSWORD'] = ADMIN.password;
  const started = await startAuthApp();
  const admin = await signIn(started.app, ADMIN);
  return {
    started,
    app: started.app,
    admin,
    adminAuthorization: bearer(admin),
    async close(): Promise<void> {
      delete process.env['BOOTSTRAP_ADMIN_EMAIL'];
      delete process.env['BOOTSTRAP_ADMIN_PASSWORD'];
      await started.app.close();
    },
  };
}
