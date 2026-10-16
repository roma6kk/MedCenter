import { join } from 'node:path';

import { runMain } from '../shared/seed-env';
import { accessChecks } from './checks-access';
import { adminCatalogChecks } from './checks-admin-catalog';
import { scheduleRemovalChecks } from './checks-schedule-removal';
import { authChecks } from './checks-auth';
import { catalogReadChecks, loadFreeSlots } from './checks-catalog-read';
import { chainChecks } from './checks-chain';
import { compartmentChecks } from './checks-compartment';
import { edgeChecks } from './checks-edge';
import { loginAll } from './checks-login';
import { noShowChecks, raceChecks } from './checks-race';
import { terminologyImportChecks, terminologyReadChecks } from './checks-terminology';
import { waitForStack } from './wait-for-stack';
import { RouteTracker, loadRouteInventory, routeKey } from './route-inventory';
import { loadAccounts, type SmokeAccounts } from './smoke-accounts';
import { expectTrue } from './smoke-assert';
import { readSmokeConfig } from './smoke-config';
import { ApiClient } from './smoke-http';
import { SmokeRunner, exitCodeOf, formatTable } from './smoke-runner';
import type { JsonObject } from './smoke-types';
import type { Suite } from './suite';

/**
 * Live smoke suite of the whole stack, through the Traefik edge only:
 *
 *   npm run smoke:stack
 *
 * Needs the stack up (`npm run stack:up`) and the demo data seeded
 * (`npm run seed:terminology`, `npm run seed:demo`, then `npm run seed:demo -- --users`).
 * Accounts come from `tools/demo-seed/output/demo-manifest.json`; no password is
 * ever printed. Exit code 0 only when every check passed.
 */

const APPS_DIRECTORY = join(__dirname, '..', '..', 'apps');

async function prepareSlots(suite: Suite): Promise<readonly JsonObject[] | undefined> {
  let slots: readonly JsonObject[] | undefined;
  await suite.runner.check('setup', 'the demo doctor has at least 4 free slots in the next 14 days', async () => {
    slots = await loadFreeSlots(suite);
  });
  return slots;
}

async function runSuite(suite: Suite, tracker: RouteTracker): Promise<void> {
  const { runner } = suite;
  const slots = await prepareSlots(suite);
  await authChecks(suite);
  await terminologyReadChecks(suite);
  await catalogReadChecks(suite);
  await adminCatalogChecks(suite);
  await scheduleRemovalChecks(suite);
  await accessChecks(suite);
  if (slots === undefined) {
    runner.skip('chain: booking', 'clinical chain, race and no-show', 'there is no free slot to book (see "setup")');
  } else {
    await chainChecks(suite, slots);
    await compartmentChecks(suite).catch((error: unknown) => runner.skip('compartment (ADR-013)', 'compartment checks', `the clinical chain did not finish: ${String(error)}`));
    await raceChecks(suite, slots);
    await noShowChecks(suite, slots);
  }
  await terminologyImportChecks(suite);
  await runner.check('route coverage', `every /api/v1 route of the 8 services answered 2xx at least once (${tracker.total} routes)`, async () => {
    const missing = tracker.uncovered().map((route) => `${routeKey(route)} (${route.service})`);
    expectTrue(missing.length === 0, `routes without a successful call: ${missing.join('; ')}`);
  });
}

async function loadAccountsOrReport(runner: SmokeRunner, manifestPath: string): Promise<SmokeAccounts | undefined> {
  let accounts: SmokeAccounts | undefined;
  await runner.check('setup', 'demo accounts are in the seed manifest', async () => {
    accounts = await loadAccounts(manifestPath);
  });
  return accounts;
}

export async function main(): Promise<number> {
  const config = readSmokeConfig();
  const runner = new SmokeRunner();
  const tracker = new RouteTracker(loadRouteInventory(APPS_DIRECTORY));
  const api = new ApiClient(config.baseUrl, (method, path, status) => tracker.record(method, path, status), config.requestTimeoutMs);
  console.log(`Stack smoke through ${config.baseUrl}`);
  await runner.check('setup', 'the stack answers through the edge (HAPI metadata, auth JWKS)', () => waitForStack(config));
  const accounts = await loadAccountsOrReport(runner, config.manifestPath);
  await edgeChecks(runner, api);
  const sessions = accounts === undefined ? undefined : await loginAll(runner, config, accounts);
  if (accounts !== undefined && sessions !== undefined) {
    await runSuite({ runner, api, config, accounts, sessions, chain: {} }, tracker);
  }
  console.log(`\n${formatTable(runner.results)}`);
  return exitCodeOf(runner.results);
}

if (require.main === module) {
  runMain(async () => {
    process.exitCode = await main();
  });
}
