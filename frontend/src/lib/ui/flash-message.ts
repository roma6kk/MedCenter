// A revoked session ends with a full-page navigation that drops memory state, so the toast is handed over through sessionStorage.

export type FlashKind = 'session-ended' | 'session-idle';

const FLASH_KEY = 'mc-flash';

export function setFlash(kind: FlashKind): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, kind);
  } catch {
    // storage blocked or full
  }
}

export function consumeFlash(): FlashKind | null {
  try {
    const value: string | null = window.sessionStorage.getItem(FLASH_KEY);
    if (value === null) return null;
    window.sessionStorage.removeItem(FLASH_KEY);
    return value === 'session-ended' || value === 'session-idle' ? value : null;
  } catch {
    return null;
  }
}
