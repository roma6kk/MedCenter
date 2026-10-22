'use client';

import type { ReactNode } from 'react';
import type { AppointmentStatus } from '@/components/feedback/stamp-badge';
import { hasMessage } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';

const SOFT_CLASS: Record<AppointmentStatus, string> = {
  booked: 'bg-primary-soft text-primary-soft-foreground',
  fulfilled: 'bg-success-soft text-success',
  cancelled: 'bg-destructive-soft text-destructive',
  noshow: 'bg-warning-soft text-warning',
};

/**
 * Soft pill of an appointment status in the redesign. It keeps the semantics of `StampBadge` (same `stamp-<status>` test id,
 * same localized `stamp.<status>` label, the status is always spelled out in words, never only by colour).
 */
export function StatusBadge({ status }: { readonly status: AppointmentStatus }): ReactNode {
  const t = useT('stamp');
  const locale = useUiStore((state) => state.locale);
  return (
    <span data-testid={`stamp-${status}`} className={cn('inline-block flex-none rounded-full px-[11px] py-1 text-[13px] font-semibold', SOFT_CLASS[status])}>
      {hasMessage(locale, `stamp.${status}`) ? t(status) : status}
    </span>
  );
}
