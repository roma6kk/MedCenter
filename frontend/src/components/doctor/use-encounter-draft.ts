'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { clearDraft, writeDraft, type EncounterDraft } from '@/lib/encounter-draft';

export const AUTOSAVE_DELAY_MS = 1000;

export type DraftStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'saved'; readonly savedAt: string }
  | { readonly kind: 'unavailable' };

export interface EncounterDraftController {
  readonly status: DraftStatus;
  readonly restoredAt: string | null;
  readonly dismissRestored: () => void;
  readonly saveNow: () => void;
  readonly clear: () => void;
  readonly forget: () => void;
}

type Methods = UseFormReturn<CompleteEncounterForm>;

export function useEncounterDraft(encounterId: string, methods: Methods, restored: EncounterDraft | null): EncounterDraftController {
  const [status, setStatus] = useState<DraftStatus>(restored === null ? { kind: 'none' } : { kind: 'saved', savedAt: restored.savedAt });
  const [restoredAt, setRestoredAt] = useState<string | null>(restored?.savedAt ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isForgotten = useRef(false);
  const hasWaitingWrite = useRef(false);
  const hasFailed = useRef(false);

  const cancelTimer = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const persist = useCallback(
    (announce: boolean): void => {
      cancelTimer();
      hasWaitingWrite.current = false;
      if (isForgotten.current) return;
      const result = writeDraft(encounterId, methods.getValues());
      hasFailed.current = result.kind === 'failed';
      if (!announce) return;
      setStatus(result.kind === 'saved' ? { kind: 'saved', savedAt: result.savedAt } : result.kind === 'blank' ? { kind: 'none' } : { kind: 'unavailable' });
    },
    [cancelTimer, encounterId, methods],
  );

  useEffect(() => {
    const subscription = methods.watch(() => {
      if (isForgotten.current) return;
      hasWaitingWrite.current = true;
      setStatus((previous) => (previous.kind === 'pending' ? previous : { kind: 'pending' }));
      cancelTimer();
      timer.current = setTimeout(() => persist(true), AUTOSAVE_DELAY_MS);
    });
    return () => subscription.unsubscribe();
  }, [cancelTimer, methods, persist]);

  useEffect(() => {
    const flush = (): void => {
      if (hasWaitingWrite.current) persist(false);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (isForgotten.current) return;
      flush();
      if (!hasFailed.current) return;
      event.preventDefault();
      // Chrome shows its prompt only for a non-empty `returnValue`.
      event.returnValue = '';
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
      cancelTimer();
    };
  }, [cancelTimer, persist]);

  const clear = useCallback((): void => {
    hasWaitingWrite.current = false;
    hasFailed.current = false;
    cancelTimer();
    clearDraft(encounterId);
    setStatus({ kind: 'none' });
    setRestoredAt(null);
  }, [cancelTimer, encounterId]);

  const forget = useCallback((): void => {
    isForgotten.current = true;
    hasWaitingWrite.current = false;
    hasFailed.current = false;
    cancelTimer();
    clearDraft(encounterId);
  }, [cancelTimer, encounterId]);

  return {
    status: isForgotten.current ? { kind: 'none' } : status,
    restoredAt: isForgotten.current ? null : restoredAt,
    dismissRestored: () => setRestoredAt(null),
    saveNow: () => persist(true),
    clear,
    forget,
  };
}
