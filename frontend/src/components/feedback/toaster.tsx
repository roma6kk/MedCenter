'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { consumeFlash } from '@/lib/ui/flash-message';
import { useT } from '@/lib/i18n/use-t';
import { showToast } from '@/lib/ui/toast';
import { useToastStore, type Toast, type ToastTone } from '@/store/use-toast-store';

const AUTO_DISMISS_MS: Readonly<Record<ToastTone, number>> = { info: 6_000, success: 6_000, error: 10_000 };

const TONE_BORDER: Readonly<Record<ToastTone, string>> = {
  info: 'var(--primary)',
  success: 'var(--success)',
  error: 'var(--destructive)',
};

function ToastItem({ toast, dismissLabel }: { readonly toast: Toast; readonly dismissLabel: string }): ReactNode {
  const dismiss = useToastStore((state) => state.dismiss);
  useEffect(() => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS[toast.tone]);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id, toast.tone]);

  return (
    <div
      data-testid={`toast-${toast.tone}`}
      style={{ borderLeftColor: TONE_BORDER[toast.tone] }}
      className="pointer-events-auto flex items-start gap-3 rounded-[6px] border border-l-4 border-[var(--border)] bg-[var(--card)] p-3 text-sm"
    >
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => dismiss(toast.id)}
        className="min-h-[24px] min-w-[24px] rounded-[6px] px-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Toast region (WCAG 4.1.3). Both live regions are always in the DOM so assistive technology registers them before the
 * first message: errors go to the assertive `alert` region, everything else to the polite `status` region.
 */
export function Toaster(): ReactNode {
  const t = useT('feedback');
  const toasts = useToastStore((state) => state.toasts);

  useEffect(() => {
    if (consumeFlash() === 'session-ended') showToast('info', 'session.ended');
  }, []);

  const polite: ReadonlyArray<Toast> = toasts.filter((toast) => toast.tone !== 'error');
  const assertive: ReadonlyArray<Toast> = toasts.filter((toast) => toast.tone === 'error');
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <div role="status" aria-live="polite" aria-label={t('notifications')} className="flex flex-col gap-2">
        {polite.map((toast) => <ToastItem key={toast.id} toast={toast} dismissLabel={t('dismiss')} />)}
      </div>
      <div role="alert" className="flex flex-col gap-2">
        {assertive.map((toast) => <ToastItem key={toast.id} toast={toast} dismissLabel={t('dismiss')} />)}
      </div>
    </div>
  );
}
