'use client';

import { useEffect, useState } from 'react';
import type { ProblemDetails } from './problem';

export const MAX_COOLDOWN_SECONDS = 300;
export const DEFAULT_COOLDOWN_SECONDS = 5;

export function cooldownSeconds(problem: ProblemDetails | null): number {
  if (problem === null || problem.errorCode !== 'RATE_LIMITED') return 0;
  const asked = problem.retryAfter ?? DEFAULT_COOLDOWN_SECONDS;
  return Number.isFinite(asked) && asked > 0 ? Math.min(Math.ceil(asked), MAX_COOLDOWN_SECONDS) : 0;
}

interface Clock {
  readonly problem: ProblemDetails | null;
  readonly now: number;
  readonly until: number;
}

function armClock(problem: ProblemDetails | null): Clock {
  const now = Date.now();
  return { problem, now, until: now + cooldownSeconds(problem) * 1000 };
}

export function useRetryCooldown(problem: ProblemDetails | null): number {
  const [clock, setClock] = useState<Clock>(() => armClock(problem));
  // A new problem restarts the clock in the same render: the submit button is never open for one frame in between.
  if (clock.problem !== problem) setClock(armClock(problem));
  const { until } = clock;
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => {
      setClock((previous) => ({ ...previous, now: Date.now() }));
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((clock.until - clock.now) / 1000));
}
