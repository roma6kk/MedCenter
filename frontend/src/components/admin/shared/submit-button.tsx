'use client';

import type { MouseEvent, ReactNode } from 'react';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { PRIMARY_BUTTON_CLASS } from './admin-styles';
import { problemOf } from './problem-of';

interface SubmitButtonProps {
  readonly label: string;
  /** The label while the request runs. */
  readonly pendingLabel: string;
  readonly isPending: boolean;
  /** The failure of the last attempt: a 429 keeps the button closed until its `Retry-After` has passed (frontend-design-spec §5.4). */
  readonly error?: unknown;
}

/**
 * The submit button of a form. While the request runs, or a 429 cools down, it is `aria-disabled` and ignores clicks, so a
 * double click sends once but the keyboard focus stays on it (a `disabled` button drops the focus to `body`, WCAG 2.4.3).
 */
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
