import { takeBaseline, notificationSteps, reportSteps } from './checks-chain-async';
import { bookingSteps } from './checks-chain-booking';
import { ensureConsent } from './consent-api';
import { completionSteps, invalidCodeSteps, openingSteps } from './checks-chain-encounter';
import { readbackSteps } from './checks-chain-readback';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject } from './smoke-types';
import type { Suite } from './suite';

function inGroup(group: string, steps: readonly SmokeStep[]): SmokeStep[] {
  return steps.map((step) => ({ group, ...step }));
}

export async function chainChecks(suite: Suite, slots: readonly JsonObject[]): Promise<void> {
  const baseline: SmokeStep = {
    name: 'admin report counters before the chain (baseline)',
    run: async () => {
      suite.chain.baseline = await takeBaseline(suite);
    },
  };
  const consent: SmokeStep = {
    name: "the chain patient has a consent in force (the seed's, else 3.10 + 3.8 as ADMIN): 7.1/7.3 need it in block mode",
    run: () => ensureConsent(suite, suite.sessions.patient),
  };
  await suite.runner.chain('chain: booking', [
    ...inGroup('chain: booking', [baseline, consent, ...bookingSteps(suite, slots)]),
    ...inGroup('chain: encounter', [...openingSteps(suite), ...completionStepsWithCodes(suite)]),
    ...inGroup('chain: patient record', readbackSteps(suite)),
    ...inGroup('chain: notification + analytics + audit', [...notificationSteps(suite), ...reportSteps(suite)]),
  ]);
}

function completionStepsWithCodes(suite: Suite): SmokeStep[] {
  return [...inGroup('terminology: invalid codes -> 422', invalidCodeSteps(suite)), ...completionSteps(suite)];
}
