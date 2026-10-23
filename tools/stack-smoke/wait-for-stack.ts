import { runMain } from '../shared/seed-env';
import { pollUntil } from './polling';
import { readSmokeConfig } from './smoke-config';
import type { SmokeConfig } from './smoke-types';

/** A 200 answer from HAPI is only ready when its body is the server's CapabilityStatement (not a Traefik error page or an OperationOutcome). */
async function isCapabilityStatement(response: Response): Promise<boolean> {
  if (response.status !== 200) {
    return false;
  }
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as { resourceType?: unknown }).resourceType === 'CapabilityStatement';
  } catch {
    return false;
  }
}

const isOk = async (response: Response): Promise<boolean> => response.status === 200;

/**
 * Waits until the stack answers through the edge: HAPI (`GET /fhir/metadata` through Traefik, the slowest
 * container: a minute or more after `docker compose up --wait`, which has no healthcheck to wait for; ready
 * means a 200 with a CapabilityStatement body) and auth-service (the JWKS every other service verifies tokens with).
 */
export async function waitForStack(config: Pick<SmokeConfig, 'baseUrl' | 'pollTimeoutMs' | 'pollIntervalMs'>): Promise<void> {
  const probes: ReadonlyArray<readonly [string, (response: Response) => Promise<boolean>]> = [
    ['/fhir/metadata', isCapabilityStatement],
    ['/.well-known/jwks.json', isOk],
  ];
  for (const [path, accepts] of probes) {
    await pollUntil(config, `${path} on ${config.baseUrl}`, async () => {
      const answered = await fetch(`${config.baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) }).then(accepts, () => false);
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
