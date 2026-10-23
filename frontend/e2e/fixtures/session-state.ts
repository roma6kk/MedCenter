/**
 * session-state — the signed-in browser states of the suite.
 *
 * `auth.setup.ts` signs every account the specs use in ONCE through the real login form and writes a Playwright
 * `storageState` file per account into the git-ignored `e2e/.auth/`; specs open their contexts from those files instead
 * of logging in again (auth-service throttles `POST /oauth/login` to 10/min per IP). The files hold session cookies —
 * they never leave this directory and are never printed or attached.
 *
 * Lifetime: the access-token cookie lives 15 minutes; after that the next request rotates the single-use refresh token.
 * Two contexts rotating the same token at once would revoke it, so the setup re-signs in whenever a state is older than
 * `REUSE_MAX_AGE_MS` and a full run is expected to stay far below the access-token lifetime.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { DemoRole } from './demo-accounts';

export interface StateAccount {
  readonly role: DemoRole;
  readonly index: number;
}

/** Every account the specs reuse; `auth-login.spec.ts` and scenario A sign in for real and are not listed. */
export const STATE_ACCOUNTS: ReadonlyArray<StateAccount> = [
  { role: 'ADMIN', index: 0 },
  { role: 'DOCTOR', index: 0 },
  { role: 'DOCTOR', index: 3 },
  { role: 'PATIENT', index: 0 },
  { role: 'PATIENT', index: 1 },
  { role: 'PATIENT', index: 2 },
];

export const AUTH_DIR = resolve(__dirname, '../.auth');
export const REUSE_MAX_AGE_MS = 5 * 60 * 1000;

export function statePath(role: DemoRole, index: number): string {
  return resolve(AUTH_DIR, `${role.toLowerCase()}-${index}.json`);
}

export function isFreshState(role: DemoRole, index: number, now = Date.now()): boolean {
  const path = statePath(role, index);
  return existsSync(path) && now - statSync(path).mtimeMs < REUSE_MAX_AGE_MS;
}

export interface StoredSession {
  readonly context: BrowserContext;
  readonly page: Page;
}

/** A new context signed in as the account, from its saved state; the page is NOT navigated anywhere. */
export async function openStoredSession(browser: Browser, baseURL: string | undefined, role: DemoRole, index = 0): Promise<StoredSession> {
  const path = statePath(role, index);
  if (!existsSync(path)) throw new Error(`No saved session for ${role} #${index}; the "setup" project (auth.setup.ts) must run first.`);
  const context = await browser.newContext({ baseURL, storageState: path });
  return { context, page: await context.newPage() };
}
