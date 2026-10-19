'use client';

import { useEffect, useState } from 'react';
import type { ProblemDetails } from './problem';

/** A `Retry-After` beyond this is not waited out on a form: the visitor can come back later (the banner still says how long). */
export const MAX_COOLDOWN_SECONDS = 300;
/** A 429 that names no `Retry-After` still gets a short pause, so that a second click is not another 429. */
export const DEFAULT_COOLDOWN_SECONDS = 5;

/** How long a form must keep its submit closed after `problem`: only `RATE_LIMITED` asks for it (frontend-design-spec §5.4). */
export function cooldownSeconds(problem: ProblemDetails | null): number {
  if (problem === null || problem.errorCode !== 'RATE_LIMITED') return 0;
  const asked: number = problem.retryAfter ?? DEFAULT_COOLDOWN_SECONDS;
  return Number.isFinite(asked) && asked > 0 ? Math.min(Math.ceil(asked), MAX_COOLDOWN_SECONDS) : 0;
}

interface Clock {
  readonly problem: ProblemDetails | null;
  readonly now: number;
  readonly until: number;
}

function armClock(problem: ProblemDetails | null): Clock {
  const now: number = Date.now();
  return { problem, now, until: now + cooldownSeconds(problem) * 1000 };
}

/**
 * Seconds a form must wait before it may send again after a 429 (`Retry-After`), counting down once a second; `0` when
 * `problem` is not a rate limit (or is `null`). Every new `problem` object starts its own countdown, so the caller
 * keeps one object per failure (state), never a fresh copy per render.
 */
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
