import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { loadDemoAccount, type DemoAccount, type DemoRole } from './demo-accounts';

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
