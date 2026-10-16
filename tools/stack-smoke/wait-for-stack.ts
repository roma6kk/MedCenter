import { runMain } from '../shared/seed-env';
import { pollUntil } from './polling';
import { readSmokeConfig } from './smoke-config';
import type { SmokeConfig } from './smoke-types';

/**
 * Waits until the stack answers through the edge: HAPI (`GET /fhir/metadata`, the slowest
 * container: a minute or more after `docker compose up --wait`, which has no healthcheck to
 * wait for) and auth-service (the JWKS every other service verifies tokens with).
 */
export async function waitForStack(config: Pick<SmokeConfig, 'baseUrl' | 'pollTimeoutMs' | 'pollIntervalMs'>): Promise<void> {
  for (const path of ['/fhir/metadata', '/.well-known/jwks.json']) {
    await pollUntil(config, `${path} on ${config.baseUrl}`, async () => {
      const answered = await fetch(`${config.baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) }).then(
        (response) => response.status === 200,
        () => false,
      );
      return answered ? true : undefined;
    });
  }
}

/** `npm run stack:wait` — run it between `npm run stack:up` and the seeds. */
if (require.main === module) {
  runMain(async () => {
    const config = readSmokeConfig();
    await waitForStack(config);
    console.log(`The stack answers at ${config.baseUrl}`);
  });
}
