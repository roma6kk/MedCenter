'use client';

import { useCallback, useRef } from 'react';
import { idempotencyKey } from '@/lib/api/api-fetch';

interface IntentKey {
  /** The key of the current intent: the same value for retries of the same `intent`, a fresh one for a different intent. */
  readonly current: () => string;
  /** Starts a new intent (after a success): the next `current()` is a new key. */
  readonly rotate: () => void;
}

/**
 * `Idempotency-Key` of one user intent (api-designer-spec §0, frontend-design-spec §2): a retry of the same request —
 * same `intent` string — reuses the key so the server answers from its cache instead of repeating the work; changing the
 * intent (another date range) or finishing it (`rotate`) makes the next request a new one.
 */
export function useIdempotencyKey(intent: string): IntentKey {
  const stored = useRef<{ readonly intent: string; readonly key: string } | null>(null);
  const current = useCallback((): string => {
    if (stored.current === null || stored.current.intent !== intent) stored.current = { intent, key: idempotencyKey() };
    return stored.current.key;
  }, [intent]);
  const rotate = useCallback((): void => {
    stored.current = null;
  }, []);
  return { current, rotate };
}
