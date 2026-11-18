export const STALE_TIME_MS = {
  catalog: 5 * 60_000,
  slots: 15_000,
  appointments: 30_000,
  notifications: 30_000,
  terminology: 60 * 60_000,
} as const;

export const POLL_INTERVAL_MS = {
  unreadCount: 30_000,
} as const;

export const DEFAULT_STALE_TIME_MS = 30_000;
