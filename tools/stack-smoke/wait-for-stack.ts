import { runMain } from '../shared/seed-env';
import { pollUntil } from './polling';
import { readSmokeConfig } from './smoke-config';
import type { SmokeConfig } from './smoke-types';

// A 200 is ready only with a CapabilityStatement body (not a Traefik error page or OperationOutcome).
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

if (require.main === module) {
  runMain(async () => {
    const config = readSmokeConfig();
    await waitForStack(config);
    console.log(`The stack answers at ${config.baseUrl}`);
  });
}
