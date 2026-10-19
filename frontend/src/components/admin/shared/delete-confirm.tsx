'use client';

import type { ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { ConfirmDialog } from './confirm-dialog';

interface DeleteConfirmProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly targetId: string;
  /** The delete mutation; it lives in this dialog's subtree, so closing the dialog also forgets its last error. */
  readonly mutation: UseMutationResult<unknown, Error, string>;
  readonly onClose: () => void;
}

/** Confirm → delete → close. A refusal (409 `ROOM_IN_USE`, `SERVICE_IN_USE`) keeps the dialog open and explains why. */
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
