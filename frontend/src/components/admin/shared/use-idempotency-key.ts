'use client';

import { useCallback, useRef } from 'react';
import { idempotencyKey } from '@/lib/api/api-fetch';

interface IntentKey {
  readonly current: () => string;
  readonly rotate: () => void;
}

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
