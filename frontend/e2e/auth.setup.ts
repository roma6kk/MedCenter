// Logins are spaced out: auth-service allows 10 POST /oauth/login per minute per IP.
import { mkdirSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { signInThroughLoginForm } from './fixtures/auth';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';
import { AUTH_DIR, isFreshState, STATE_ACCOUNTS, statePath } from './fixtures/session-state';

const LOGIN_GAP_MS = 7_000;

setup.skip(!hasDemoManifest(), 'demo seed manifest not found');

setup('should save a signed-in state for every demo account the specs use', async ({ browser, baseURL }) => {
  setup.setTimeout(STATE_ACCOUNTS.length * (LOGIN_GAP_MS + 30_000));
  mkdirSync(AUTH_DIR, { recursive: true });
  let signedIn = 0;
  for (const { role, index } of STATE_ACCOUNTS) {
    if (isFreshState(role, index)) continue;
    if (signedIn > 0) await new Promise((done) => setTimeout(done, LOGIN_GAP_MS));
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await signInThroughLoginForm(page, loadDemoAccount(role, index), { webOrigin: baseURL });
    await context.storageState({ path: statePath(role, index) });
    await context.close();
    signedIn += 1;
  }
});
