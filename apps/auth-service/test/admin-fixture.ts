import type { INestApplication } from '@nestjs/common';

import { startAuthApp, type AuthApp } from './app-harness';
import { bearer, signIn, type TokenBody } from './auth-flow-helpers';

export const ADMIN = { email: 'admin@medcenter.by', password: 'Adm1n!Passw0rd' } as const;

export interface AdminFixture {
  readonly started: AuthApp;
  readonly app: INestApplication;
  /** Token of the administrator the service bootstrapped from the environment. */
  readonly admin: TokenBody;
  /** `Authorization` header value of {@link admin}. */
  readonly adminAuthorization: string;
  close(): Promise<void>;
}

/**
 * Boots the app with `BOOTSTRAP_ADMIN_*` set — the way a fresh stack gets its
 * first administrator — and signs that administrator in through the browser flow.
 */
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
