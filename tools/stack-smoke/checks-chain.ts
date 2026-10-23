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

/**
 * The clinical chain, end to end through the edge: find a doctor and a free
 * slot, book with an Idempotency-Key, replay it, the doctor sees it, opens the
 * encounter (the patient's consent is recorded first, ADR-019), terminology refuses bad codes, completes it with ICD-10 J06.9 /
 * 36.6 Cel / J01FA10, a replay is refused, the patient reads the record, the
 * notification arrives, and the admin reports and audit show the activity.
 * One chain: a failed step skips the rest, because each needs the previous one.
 */
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
