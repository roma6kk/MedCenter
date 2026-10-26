'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { clearDraft, writeDraft, type EncounterDraft } from '@/lib/encounter-draft';

/** How long the form must rest before the draft is written: one write per pause, not one per keystroke. */
export const AUTOSAVE_DELAY_MS = 1000;

export type DraftStatus =
  /** Nothing typed yet, or the form was emptied: no draft exists. */
  | { readonly kind: 'none' }
  /** Typed since the last write. */
  | { readonly kind: 'pending' }
  | { readonly kind: 'saved'; readonly savedAt: string }
  /** The browser refused the write (blocked or full storage): the text lives on the screen only. */
  | { readonly kind: 'unavailable' };

export interface EncounterDraftController {
  readonly status: DraftStatus;
  /** When the draft that was put back into the form on opening was saved; `null` once the notice is dismissed or there was none. */
  readonly restoredAt: string | null;
  readonly dismissRestored: () => void;
  /** Writes now (the «Сохранить черновик» button). */
  readonly saveNow: () => void;
  /** Drops the saved draft but keeps autosaving (the doctor emptied the form to start over). */
  readonly clear: () => void;
  /** Drops the draft and stops autosaving for good: the visit was completed. */
  readonly forget: () => void;
}

type Methods = UseFormReturn<CompleteEncounterForm>;

/**
 * Local autosave of the completion form (A8). The service has no draft endpoint, so the draft lives in this browser only
 * (`lib/encounter-draft`). The form is written after a pause in typing, when the tab is hidden or closed and when the form
 * unmounts. The browser's "leave the page?" prompt is raised only when the text is not safely kept: a write that is still
 * waiting and fails now, or storage that refused the last one. With a good draft there is nothing to lose, so no prompt.
 */
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

  /** Writes the current values; `announce` is false while the page is going away and nobody is left to read a status. */
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
      // Chrome shows its prompt only for a non-empty `returnValue`; the text itself is never displayed any more.
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

  /**
   * The visit is completed. No state is set here: this runs from the mutation's own success callback, outside any event, and
   * the form re-renders when the mutation settles anyway; `status` and `restoredAt` below read `isForgotten` for that render.
   */
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
