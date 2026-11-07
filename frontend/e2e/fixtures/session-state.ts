import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { DemoRole } from './demo-accounts';

export interface StateAccount {
  readonly role: DemoRole;
  readonly index: number;
}

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

export async function openStoredSession(browser: Browser, baseURL: string | undefined, role: DemoRole, index = 0): Promise<StoredSession> {
  const path = statePath(role, index);
  if (!existsSync(path)) throw new Error(`No saved session for ${role} #${index}; the "setup" project (auth.setup.ts) must run first.`);
  const context = await browser.newContext({ baseURL, storageState: path });
  return { context, page: await context.newPage() };
}
