/**
 * flash-message — one message that survives a full-page navigation (sessionStorage, best effort).
 *
 * `apiFetch` ends a revoked session with `window.location.assign('/login…')`, which discards in-memory state, so the
 * "session ended" toast is handed over through storage and shown by `<Toaster />` on the next page.
 */

export type FlashKind = 'session-ended';

const FLASH_KEY = 'mc-flash';

export function setFlash(kind: FlashKind): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, kind);
  } catch {
    // Storage may be blocked (private mode, site data off): the toast is a courtesy, the redirect still happens.
  }
}

/** Reads and removes the pending message. */
export function consumeFlash(): FlashKind | null {
  try {
    const value: string | null = window.sessionStorage.getItem(FLASH_KEY);
    if (value === null) return null;
    window.sessionStorage.removeItem(FLASH_KEY);
    return value === 'session-ended' ? value : null;
  } catch {
    // See setFlash: nothing to show when storage is unavailable.
    return null;
  }
}
