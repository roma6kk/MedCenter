import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { loadDemoAccount, type DemoAccount, type DemoRole } from './demo-accounts';
import type { StoredSession } from './session-state';

const SIGN_IN_TIMEOUT_MS = 20_000;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

export interface SignInOptions {
  readonly webOrigin?: string;
  readonly returnTo?: string;
}

export function returnToOfAuthorizeUrl(url: string): string | null {
  const state = new URL(url).searchParams.get('state') ?? '';
  const separator = state.indexOf('.');
  return separator === -1 ? null : decodeURIComponent(state.slice(separator + 1));
}

export async function fillAuthServiceForm(page: Page, account: DemoAccount, webOrigin: string): Promise<void> {
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password());
  await Promise.all([
    page.waitForURL((url) => url.origin === webOrigin, { timeout: SIGN_IN_TIMEOUT_MS }),
    page.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

export async function signInThroughLoginForm(page: Page, account: DemoAccount, options: SignInOptions = {}): Promise<void> {
  const webOrigin = new URL(options.webOrigin ?? DEFAULT_WEB_ORIGIN).origin;
  const entry = options.returnTo === undefined ? '/login' : `/login?returnTo=${encodeURIComponent(options.returnTo)}`;
  await page.goto(`${webOrigin}${entry}`);
  await fillAuthServiceForm(page, account, webOrigin);
}

export async function openSignedInSession(browser: Browser, role: DemoRole, index: number, baseURL: string | undefined, returnTo?: string): Promise<StoredSession> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInThroughLoginForm(page, loadDemoAccount(role, index), { webOrigin: baseURL, returnTo });
  return { context, page };
}

interface SignedInFixtures {
  readonly patientPage: Page;
  readonly doctorPage: Page;
  readonly adminPage: Page;
}

const signedInPage =
  (role: DemoRole) =>
  async ({ browser, baseURL }: { browser: Browser; baseURL: string | undefined }, use: (page: Page) => Promise<void>): Promise<void> => {
    const { page } = await openSignedInSession(browser, role, 0, baseURL);
    await use(page);
    await page.context().close();
  };

export const test = base.extend<SignedInFixtures>({
  patientPage: signedInPage('PATIENT'),
  doctorPage: signedInPage('DOCTOR'),
  adminPage: signedInPage('ADMIN'),
});

export { expect };
