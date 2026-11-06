'use client';

import { useState } from 'react';

export interface ReadFailure {
  readonly error: unknown;
  readonly isRetrying: boolean;
}

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

// TanStack resets a data-less query to pending on refetch; keep the last error of the same query so the retry button keeps its focus.
export function useFailedRead(query: ReadState): ReadFailure | null {
  const [last, setLast] = useState<LastFailure | null>(null);
  const isFailed: boolean = query.isError && query.data === undefined;
  // Remembered in the same render: no frame without the error in between.
  if (isFailed && (last === null || last.errorUpdatedAt !== query.errorUpdatedAt)) setLast({ error: query.error, errorUpdatedAt: query.errorUpdatedAt });
  if (isFailed) return { error: query.error, isRetrying: false };
  if (query.data === undefined && query.isPending && last !== null && last.errorUpdatedAt === query.errorUpdatedAt) {
    return { error: last.error, isRetrying: true };
  }
  return null;
}
