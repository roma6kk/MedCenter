import { assertLocalTarget } from './local-target';

export const DEFAULT_FHIR_BASE_URL = 'http://localhost:8080/fhir';

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}

// FHIR_BASE_URL is deliberately not a fallback: it may point at somebody else's HAPI, which a seed would rewrite.
export function resolveFhirBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (message) => console.warn(message),
): string {
  const configured = nonEmpty(env['SEED_FHIR_BASE_URL']);
  if (configured === undefined && nonEmpty(env['FHIR_BASE_URL']) !== undefined) {
    warn(
      `FHIR_BASE_URL is set but the seed ignores it; writing to ${DEFAULT_FHIR_BASE_URL}. ` +
        'Set SEED_FHIR_BASE_URL to seed another server.',
    );
  }
  const baseUrl = configured ?? DEFAULT_FHIR_BASE_URL;
  assertLocalTarget('SEED_FHIR_BASE_URL', baseUrl, 'SEED_ALLOW_REMOTE', env);
  return baseUrl;
}

export function readOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return nonEmpty(env[name]);
}

export function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = nonEmpty(env[name]);
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

export function runMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
