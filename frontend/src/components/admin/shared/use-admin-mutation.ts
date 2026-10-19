'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { invalidateFor, type MutationKind } from '@/lib/api/invalidation';
import { showToast } from '@/lib/ui/toast';

interface AdminMutationOptions<TVars, TResult> {
  readonly mutationFn: (vars: TVars) => Promise<TResult>;
  /** Which cached queries the mutation makes stale (frontend-design-spec §5.1). */
  readonly invalidates: MutationKind;
  /** Message key of the success toast (aria-live); no toast when omitted. */
  readonly successMessageKey?: string;
  /** How long the finished mutation (with its variables) stays in the cache; `0` for one that carries a secret (a new password). */
  readonly gcTime?: number;
}

/** A write against the admin API: invalidates the affected lists, then confirms with a toast. Errors stay with the caller. */
export function useAdminMutation<TVars, TResult>({
  mutationFn,
  invalidates,
  successMessageKey,
  gcTime,
}: AdminMutationOptions<TVars, TResult>): UseMutationResult<TResult, Error, TVars> {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn,
    ...(gcTime === undefined ? {} : { gcTime }),
    onSuccess: async () => {
      await invalidateFor(queryClient, invalidates);
      if (successMessageKey !== undefined) showToast('success', successMessageKey);
    },
  });
}
