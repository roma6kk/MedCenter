'use client';

import type { MouseEvent, ReactNode } from 'react';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { PRIMARY_BUTTON_CLASS } from './admin-styles';
import { problemOf } from './problem-of';

interface SubmitButtonProps {
  readonly label: string;
  readonly pendingLabel: string;
  readonly isPending: boolean;
  readonly error?: unknown;
}

// `aria-disabled`, not `disabled`, while the request runs: a disabled button drops the keyboard focus to `body` (WCAG 2.4.3).
export function SubmitButton({ label, pendingLabel, isPending, error }: SubmitButtonProps): ReactNode {
  const tProblem = useT('feedback.problem');
  const cooldown: number = useRetryCooldown(problemOf(error));
  const isBlocked: boolean = isPending || cooldown > 0;
  const text: string = isPending ? pendingLabel : cooldown > 0 ? tProblem('retryAfter', { seconds: cooldown }) : label;
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (isBlocked) event.preventDefault();
  };
  return (
    <button type="submit" aria-disabled={isBlocked || undefined} onClick={handleClick} className={PRIMARY_BUTTON_CLASS}>
      {text}
    </button>
  );
}
