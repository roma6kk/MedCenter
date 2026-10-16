import { assertLocalTarget } from './local-target';

/**
 * Environment of the seed tools. Variable *names* only — no value is read from
 * a file here: the tools run with whatever the shell exports.
 */

/** HAPI as published by the compose stack on the host (`hapi` is not resolvable outside the compose network). */
export const DEFAULT_FHIR_BASE_URL = 'http://localhost:8080/fhir';

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}

/**
 * The server the seed writes to: `SEED_FHIR_BASE_URL`, else the host-published
 * local HAPI. `FHIR_BASE_URL` is deliberately NOT a fallback: it is the address
 * the services export (in-network `http://hapi:8080/fhir`, or a real stand), so a
 * shell that carries the services' environment would silently aim a seed that
 * rewrites terminology and deletes legacy copies at somebody else's HAPI. A
 * `FHIR_BASE_URL` without `SEED_FHIR_BASE_URL` is reported through `warn`.
 */
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

/** Reads an optional variable; an empty value counts as unset. */
export function readOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return nonEmpty(env[name]);
}

/** Reads a mandatory variable, naming it in the error (the value is never echoed). */
export function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = nonEmpty(env[name]);
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

/** Runs an async CLI entry point: a failure is logged and sets the exit code, never swallowed. */
export function runMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
