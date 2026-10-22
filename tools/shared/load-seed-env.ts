import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Names the seed tools may take from the repository's `.env`. Only these: the file also
 * carries the services' own settings (`FHIR_BASE_URL` of the compose network among them),
 * which would aim a seed at the wrong server — see `resolveFhirBaseUrl`.
 */
export const SEED_ENV_NAMES: readonly string[] = [
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'SEED_FHIR_BASE_URL',
  'SEED_AUTH_BASE_URL',
  'OAUTH_CLIENT_ID',
  'OAUTH_REDIRECT_URI',
  'DEMO_EMAIL_DOMAIN',
  'DEMO_ADMIN_PASSWORD',
  'DEMO_DOCTOR_PASSWORD',
  'DEMO_PATIENT_PASSWORD',
];

/**
 * Fills the seed variables that the shell has not set from `<dir>/.env`. A variable
 * already in the environment always wins, so `env X=… npm run seed:demo` still overrides the file.
 * A missing file is fine. Returns the names that were taken from the file (never the values).
 */
export function loadSeedEnv(dir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const path = join(dir, '.env');
  if (!existsSync(path)) {
    return [];
  }
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  const taken: string[] = [];
  for (const name of SEED_ENV_NAMES) {
    const value = parsed[name];
    if (value !== undefined && value.trim() !== '' && (env[name] === undefined || env[name]?.trim() === '')) {
      env[name] = value;
      taken.push(name);
    }
  }
  return taken;
}
