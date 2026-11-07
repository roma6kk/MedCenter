'use client';

import type { ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { ConfirmDialog } from './confirm-dialog';

interface DeleteConfirmProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly targetId: string;
  readonly mutation: UseMutationResult<unknown, Error, string>;
  readonly onClose: () => void;
}

export function DeleteConfirm({ title, message, confirmLabel, targetId, mutation, onClose }: DeleteConfirmProps): ReactNode {
  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      isPending={mutation.isPending}
      error={mutation.error ?? undefined}
      onConfirm={() => mutation.mutate(targetId, { onSuccess: onClose })}
      onCancel={onClose}
    />
  );
}
