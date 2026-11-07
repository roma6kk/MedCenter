import { SmokeAssertionError } from './smoke-assert';
import type { SmokeConfig } from './smoke-types';

const sleep = (millis: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, millis));

export async function pollUntil<T>(
  config: Pick<SmokeConfig, 'pollTimeoutMs' | 'pollIntervalMs'>,
  label: string,
  probe: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + config.pollTimeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new SmokeAssertionError(`${label} did not show up within ${Math.round(config.pollTimeoutMs / 1000)} s`);
    }
    await sleep(config.pollIntervalMs);
  }
}
