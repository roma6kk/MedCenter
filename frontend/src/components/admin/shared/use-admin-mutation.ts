'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { invalidateFor, type MutationKind } from '@/lib/api/invalidation';
import { showToast } from '@/lib/ui/toast';

interface AdminMutationOptions<TVars, TResult> {
  readonly mutationFn: (vars: TVars) => Promise<TResult>;
  readonly invalidates: MutationKind;
  readonly successMessageKey?: string | ((result: TResult) => string);
  readonly gcTime?: number;
}

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
    onSuccess: async (result) => {
      await invalidateFor(queryClient, invalidates);
      if (successMessageKey !== undefined) showToast('success', typeof successMessageKey === 'function' ? successMessageKey(result) : successMessageKey);
    },
  });
}
