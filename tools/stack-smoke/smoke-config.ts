import { join } from 'node:path';

import { DEFAULT_AUTH_BASE_URL, DEFAULT_OAUTH_CLIENT_ID, DEFAULT_OAUTH_REDIRECT_URI } from '../demo-seed/demo-cli-options';
import { assertLocalTarget } from '../shared/local-target';
import { readOptionalEnv } from '../shared/seed-env';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './smoke-http';
import type { SmokeConfig } from './smoke-types';

export const DEFAULT_MANIFEST_PATH = join(__dirname, '..', 'demo-seed', 'output', 'demo-manifest.json');
const DEFAULT_POLL_TIMEOUT_MS = 120_000;
// 24 probes a minute: under the edge rate limit of /fhir/metadata (infra/traefik/dynamic.yml, 60 a minute).
const DEFAULT_POLL_INTERVAL_MS = 2_500;

function positiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function consentEnforcementOf(raw: string | undefined): SmokeConfig['consentEnforcement'] {
  if (raw === undefined) {
    return undefined;
  }
  if (raw !== 'warn' && raw !== 'block') {
    throw new Error('SMOKE_CONSENT_ENFORCEMENT must be warn or block');
  }
  return raw;
}

export function readSmokeConfig(env: NodeJS.ProcessEnv = process.env): SmokeConfig {
  const baseUrl = (readOptionalEnv(env, 'SMOKE_BASE_URL') ?? DEFAULT_AUTH_BASE_URL).replace(/\/+$/, '');
  assertLocalTarget('SMOKE_BASE_URL', baseUrl, 'SMOKE_ALLOW_REMOTE', env);
  const consentEnforcement = consentEnforcementOf(readOptionalEnv(env, 'SMOKE_CONSENT_ENFORCEMENT'));
  return {
    baseUrl,
    manifestPath: readOptionalEnv(env, 'SMOKE_MANIFEST_PATH') ?? DEFAULT_MANIFEST_PATH,
    oauthClientId: readOptionalEnv(env, 'SMOKE_OAUTH_CLIENT_ID') ?? DEFAULT_OAUTH_CLIENT_ID,
    redirectUri: readOptionalEnv(env, 'SMOKE_OAUTH_REDIRECT_URI') ?? DEFAULT_OAUTH_REDIRECT_URI,
    pollTimeoutMs: positiveNumber(readOptionalEnv(env, 'SMOKE_POLL_TIMEOUT_MS'), DEFAULT_POLL_TIMEOUT_MS, 'SMOKE_POLL_TIMEOUT_MS'),
    pollIntervalMs: positiveNumber(readOptionalEnv(env, 'SMOKE_POLL_INTERVAL_MS'), DEFAULT_POLL_INTERVAL_MS, 'SMOKE_POLL_INTERVAL_MS'),
    requestTimeoutMs: positiveNumber(readOptionalEnv(env, 'SMOKE_REQUEST_TIMEOUT_MS'), DEFAULT_REQUEST_TIMEOUT_MS, 'SMOKE_REQUEST_TIMEOUT_MS'),
    ...(consentEnforcement === undefined ? {} : { consentEnforcement }),
  };
}
