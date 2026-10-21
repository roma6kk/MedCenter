'use client';

import { useState } from 'react';

/** A failed read, as a screen shows it: the error to explain, and whether the read is being asked for again right now. */
export interface ReadFailure {
  readonly error: unknown;
  readonly isRetrying: boolean;
}

/** The part of a TanStack `UseQueryResult` the hook looks at. */
export interface ReadState {
  readonly data: unknown;
  readonly error: unknown;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly errorUpdatedAt: number;
}

interface LastFailure {
  readonly error: unknown;
  readonly errorUpdatedAt: number;
}

/**
 * The failure of a read that has no data yet, kept on screen while the read is repeated.
 *
 * TanStack Query resets a data-less query to `pending` the moment it refetches (the error is cleared), so a screen that
 * shows `isError ? banner : skeleton` swaps the banner for a skeleton on «Retry»: the button under the keyboard user's
 * focus disappears and focus falls to `<body>`. This hook remembers the last error of the SAME query (its
 * `errorUpdatedAt` is unchanged while the refetch runs; another key starts at 0) and reports `isRetrying`, so the banner
 * stays, the button closes and keeps focus. `null` means: no failure to show (loading for the first time, or data present).
 */
export function useFailedRead(query: ReadState): ReadFailure | null {
  const [last, setLast] = useState<LastFailure | null>(null);
  const isFailed: boolean = query.isError && query.data === undefined;
  // Remembered in the same render (the documented derive-state-from-props pattern): no frame without the error in between.
  if (isFailed && (last === null || last.errorUpdatedAt !== query.errorUpdatedAt)) setLast({ error: query.error, errorUpdatedAt: query.errorUpdatedAt });
  if (isFailed) return { error: query.error, isRetrying: false };
  if (query.data === undefined && query.isPending && last !== null && last.errorUpdatedAt === query.errorUpdatedAt) {
    return { error: last.error, isRetrying: true };
  }
  return null;
}
