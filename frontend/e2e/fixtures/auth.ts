/**
 * auth — Playwright helpers that sign in through the REAL browser flow: `/login` → `/api/auth/authorize` → the auth-service
 * login form → `/api/auth/callback`. Nothing is faked, so a regression of the redirect_uri, the PKCE cookie or the token broker
 * fails here first.
 */
import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { loadDemoAccount, type DemoAccount, type DemoRole } from './demo-accounts';

const SIGN_IN_TIMEOUT_MS = 20_000;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

export interface SignInOptions {
  /** Origin of the web app (`baseURL`); the login form lives on the auth origin, so it cannot be read from `page.url()`. */
  readonly webOrigin?: string;
  /** Path the user asked for before being sent to the login screen. */
  readonly returnTo?: string;
}

/** Fills the auth-service login form (addressed by field name) and waits until the browser is back on the web app. */
export async function signInThroughLoginForm(page: Page, account: DemoAccount, options: SignInOptions = {}): Promise<void> {
  const webOrigin = new URL(options.webOrigin ?? DEFAULT_WEB_ORIGIN).origin;
  const entry = options.returnTo === undefined ? '/login' : `/login?returnTo=${encodeURIComponent(options.returnTo)}`;
  await page.goto(`${webOrigin}${entry}`);
  await page.getByRole('link', { name: 'Войти' }).click();
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password());
  await Promise.all([
    page.waitForURL((url) => url.origin === webOrigin, { timeout: SIGN_IN_TIMEOUT_MS }),
    page.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

export async function openSignedInPage(browser: Browser, role: DemoRole, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInThroughLoginForm(page, loadDemoAccount(role), { webOrigin: baseURL });
  return page;
}

interface SignedInFixtures {
  readonly patientPage: Page;
  readonly doctorPage: Page;
  readonly adminPage: Page;
}

/** `test('…', async ({ patientPage }) => …)` — a page that is already signed in as a seeded demo user. */
export const test = base.extend<SignedInFixtures>({
  patientPage: async ({ browser, baseURL }, use) => {
    const page = await openSignedInPage(browser, 'PATIENT', baseURL);
    await use(page);
    await page.context().close();
  },
  doctorPage: async ({ browser, baseURL }, use) => {
    const page = await openSignedInPage(browser, 'DOCTOR', baseURL);
    await use(page);
    await page.context().close();
  },
  adminPage: async ({ browser, baseURL }, use) => {
    const page = await openSignedInPage(browser, 'ADMIN', baseURL);
    await use(page);
    await page.context().close();
  },
});

export { expect };
