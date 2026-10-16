/**
 * query-config — cache lifetimes and polling intervals of frontend-design-spec §5.1 and ADR-015.
 *
 * Server data is cached only in TanStack Query (never in Zustand). Slot freshness matters most: a slot list older
 * than 15 s may offer a slot another patient has just taken (BR-001).
 */

export const STALE_TIME_MS = {
  /** `services` / `doctors` / `rooms`: the server caches them in Redis for 5 min. */
  catalog: 5 * 60_000,
  slots: 15_000,
  appointments: 30_000,
  notifications: 30_000,
  /** ValueSet expansions only change on a terminology import. */
  terminology: 60 * 60_000,
} as const;

export const POLL_INTERVAL_MS = {
  /** ADR-015: polling instead of SSE; only while the window has focus (`refetchIntervalInBackground` stays off). */
  unreadCount: 30_000,
} as const;

export const DEFAULT_STALE_TIME_MS = 30_000;
