import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const SEED_ENV_NAMES: readonly string[] = [
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
