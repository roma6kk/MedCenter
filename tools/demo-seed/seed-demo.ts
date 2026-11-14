import { join } from 'node:path';

import { FhirHttp } from '../shared/fhir-http';
import { loadSeedEnv } from '../shared/load-seed-env';
import { resolveFhirBaseUrl, runMain } from '../shared/seed-env';
import { parseCliArgs, readUsersConfig, type CliOptions } from './demo-cli-options';
import { buildFhirManifest, readManifest, writeManifest, type DemoUsersSection } from './demo-manifest';
import { DEFAULT_PATIENT_WITHOUT_CONSENT, seedDemoConsents, selectConsentPatients } from './demo-consents';
import { PATIENTS } from './demo-catalog';
import { attachPatientPhotos } from './demo-patient-photos';
import { repairDemoData } from './demo-repair';
import { clinicDateOf } from './demo-slots';
import { seedDemoFhir, type DemoFhirSummary } from './seed-demo-fhir';
import { seedDemoUsers } from './seed-demo-users';

const MANIFEST_PATH = join(__dirname, 'output', 'demo-manifest.json');

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
  const photos = await attachPatientPhotos(new FhirHttp(resolveFhirBaseUrl()));
  console.log(`Patient photos: updated=${photos.updated.length} unchanged=${photos.unchanged.length} missing=${photos.missing.length}${photos.missing.length > 0 ? ` (${photos.missing.join(', ')})` : ''}`);
}

async function runConsentsStep(options: CliOptions, now: Date): Promise<void> {
  const manifest = await readManifest(MANIFEST_PATH);
  const accounts = (manifest.users?.accounts ?? []).filter((account) => account.role === 'PATIENT' && account.status !== 'failed');
  if (accounts.length === 0) {
    throw new Error('The manifest has no demo patient accounts: run "npm run seed:demo -- --users" first');
  }
  const except = options.consentExcept === undefined ? DEFAULT_PATIENT_WITHOUT_CONSENT : options.consentExcept === 'none' ? undefined : options.consentExcept;
  const selection = selectConsentPatients(PATIENTS, accounts.map((account) => account.email), except);
  const baseUrl = resolveFhirBaseUrl();
  console.log(`Seeding demo information system consents into ${baseUrl}`);
  const summary = await seedDemoConsents(new FhirHttp(baseUrl), { ...selection, now });
  console.log(`information system consent created: ${summary.created.join(', ') || 'none'}`);
  console.log(`information system consent already active (kept): ${summary.alreadyActive.join(', ') || 'none'}`);
  console.log(`Left WITHOUT consent on purpose (the CONSENT_REQUIRED demo): ${summary.withoutConsent.join(', ') || 'nobody'}`);
  if (summary.missing.length > 0) {
    throw new Error(`No Patient on the server for: ${summary.missing.join(', ')} (register the accounts: --users)`);
  }
}

async function runRepairStep(): Promise<void> {
  const baseUrl = resolveFhirBaseUrl();
  console.log(`Repairing demo data in ${baseUrl}`);
  const summary = await repairDemoData(new FhirHttp(baseUrl));
  console.log(`Appointments booked with a finished encounter, now fulfilled: ${summary.fulfilled.length}${summary.fulfilled.length > 0 ? ` (${summary.fulfilled.join(', ')})` : ''}`);
  console.log(`Inactive schedules (kept): ${summary.leftovers.inactiveSchedules}`);
  console.log(`Check leftovers (not deleted): ${summary.leftovers.checkResources.length === 0 ? 'none' : summary.leftovers.checkResources.join('; ')}`);
  if (summary.failed.length > 0) {
    throw new Error(`${summary.failed.length} appointment(s) not updated: ${summary.failed.map((item) => `${item.id} (${item.status})`).join(', ')}`);
  }
}

if (require.main === module) {
  runMain(async () => {
    loadSeedEnv(join(__dirname, '..', '..'));
    const options = parseCliArgs(process.argv.slice(2));
    const now = new Date();
    if (options.runFhir) {
      await runFhirStep(options, now);
    }
    if (options.runUsers) {
      await runUsersStep(now, options.withAdmin);
    }
    if (options.runConsents) {
      await runConsentsStep(options, now);
    }
    if (options.runRepair) {
      await runRepairStep();
    }
  });
}
