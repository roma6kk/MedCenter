import { join } from 'node:path';

import { FhirHttp } from '../shared/fhir-http';
import { resolveFhirBaseUrl, runMain } from '../shared/seed-env';
import { parseCliArgs, readUsersConfig, type CliOptions } from './demo-cli-options';
import { buildFhirManifest, readManifest, writeManifest, type DemoUsersSection } from './demo-manifest';
import { clinicDateOf } from './demo-slots';
import { seedDemoFhir, type DemoFhirSummary } from './seed-demo-fhir';
import { seedDemoUsers } from './seed-demo-users';

/**
 * Demo data for the running stack (idempotent):
 *
 *   npm run seed:demo                 FHIR reference data + 14 days of free slots
 *   npm run seed:demo -- --users      demo doctors and patients (run after auth-service is deployed)
 *   npm run seed:demo -- --users --with-admin   the same plus the demo ADMIN the smoke suite signs in as
 *   npm run seed:demo -- --fhir --users   both, FHIR first
 *
 * Environment (names only; see `demo-cli-options.ts`): `SEED_FHIR_BASE_URL`
 * (the services' `FHIR_BASE_URL` is deliberately not read), and for `--users`
 * `SEED_AUTH_BASE_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`,
 * `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URI`, `DEMO_EMAIL_DOMAIN`,
 * `DEMO_DOCTOR_PASSWORD`, `DEMO_PATIENT_PASSWORD`.
 * Both steps refuse a non-local `SEED_FHIR_BASE_URL` / `SEED_AUTH_BASE_URL` unless
 * `SEED_ALLOW_REMOTE=true` (they create accounts and rewrite reference data).
 * The manifest (ids, generated credentials) goes to the git-ignored
 * `tools/demo-seed/output/demo-manifest.json`.
 */

export const MANIFEST_PATH = join(__dirname, 'output', 'demo-manifest.json');

function printFhirSummary(summary: DemoFhirSummary): void {
  console.log(`Slot horizon: ${summary.horizon.from} .. ${summary.horizon.to}`);
  for (const [type, stats] of Object.entries(summary.writes)) {
    console.log(`${type.padEnd(18)} created=${stats.created} unchanged-or-updated=${stats.updated}`);
  }
  for (const slots of summary.slots) {
    console.log(`Slot ${slots.scheduleKey.padEnd(18)} planned=${slots.planned} created=${slots.created}`);
  }
  console.log(`Seeded resources on the server (by tag): ${JSON.stringify(summary.seededCounts)}`);
}

async function runFhirStep(options: CliOptions, now: Date): Promise<void> {
  const baseUrl = resolveFhirBaseUrl();
  const fromDay = options.from ?? clinicDateOf(now);
  console.log(`Seeding demo FHIR data into ${baseUrl}`);
  const summary = await seedDemoFhir(new FhirHttp(baseUrl), { fromDay, days: options.days, now });
  printFhirSummary(summary);
  await writeManifest(MANIFEST_PATH, buildFhirManifest(summary, baseUrl, now.toISOString()));
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

async function runUsersStep(now: Date, withAdmin: boolean): Promise<void> {
  const previous = (await readManifest(MANIFEST_PATH)).users;
  // The manifest is the only home of generated passwords: persist it after every account, not just at the end.
  const persist = async (progress: DemoUsersSection): Promise<void> => {
    await writeManifest(MANIFEST_PATH, { users: progress });
  };
  const section = await seedDemoUsers(readUsersConfig(process.env, previous, now, withAdmin), undefined, persist);
  await writeManifest(MANIFEST_PATH, { users: section });
  console.log(`Manifest (accounts, generated passwords): ${MANIFEST_PATH}`);
  const failed = section.accounts.filter((account) => account.status === 'failed');
  if (failed.length > 0) {
    throw new Error(`${failed.length} account(s) failed: ${failed.map((account) => account.email).join(', ')}`);
  }
}

if (require.main === module) {
  runMain(async () => {
    const options = parseCliArgs(process.argv.slice(2));
    const now = new Date();
    if (options.runFhir) {
      await runFhirStep(options, now);
    }
    if (options.runUsers) {
      await runUsersStep(now, options.withAdmin);
    }
  });
}
