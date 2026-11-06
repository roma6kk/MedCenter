'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X, type LucideIcon } from 'lucide-react';
import { consumeFlash } from '@/lib/ui/flash-message';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { showToast } from '@/lib/ui/toast';
import { useToastStore, type Toast, type ToastTone } from '@/store/use-toast-store';

const AUTO_DISMISS_MS: Readonly<Record<ToastTone, number>> = { info: 6_000, success: 6_000, error: 10_000 };
const ACTION_DISMISS_MS = 10_000;

interface ToneLook {
  readonly icon: LucideIcon;
  readonly iconClass: string;
}

const TONE: Readonly<Record<ToastTone, ToneLook>> = {
  info: { icon: Info, iconClass: 'text-info' },
  success: { icon: CheckCircle2, iconClass: 'text-success' },
  error: { icon: CircleAlert, iconClass: 'text-destructive' },
};

function ToastItem({ toast, dismissLabel }: { readonly toast: Toast; readonly dismissLabel: string }): ReactNode {
  const dismiss = useToastStore((state) => state.dismiss);
  const { action } = toast;
  useEffect(() => {
    const delay: number = action === undefined ? AUTO_DISMISS_MS[toast.tone] : Math.max(ACTION_DISMISS_MS, AUTO_DISMISS_MS[toast.tone]);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => dismiss(toast.id), delay);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id, toast.tone, action]);
  const { icon: Icon, iconClass } = TONE[toast.tone];

  return (
    <div
      data-testid={`toast-${toast.tone}`}
      className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-card border border-border bg-card p-3 pl-4 text-sm shadow-elev-2"
    >
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', iconClass)} />
      <p className="flex-1 py-1">{toast.message}</p>
      {action === undefined ? null : (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            dismiss(toast.id);
          }}
          className="min-h-[44px] shrink-0 rounded-control px-3 font-semibold text-primary-soft-foreground transition-[background-color] duration-fast ease-out hover:bg-primary-soft"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => dismiss(toast.id)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] duration-fast ease-out hover:bg-secondary hover:text-foreground"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function Toaster(): ReactNode {
  const t = useT('feedback');
  const toasts = useToastStore((state) => state.toasts);

  useEffect(() => {
    if (consumeFlash() === 'session-ended') showToast('info', 'session.ended');
  }, []);

  const polite: ReadonlyArray<Toast> = toasts.filter((toast) => toast.tone !== 'error');
  const assertive: ReadonlyArray<Toast> = toasts.filter((toast) => toast.tone === 'error');
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 sm:inset-x-auto sm:right-4 sm:mx-0">
      <div role="status" aria-live="polite" aria-label={t('notifications')} className="flex flex-col gap-2">
        {polite.map((toast) => <ToastItem key={toast.id} toast={toast} dismissLabel={t('dismiss')} />)}
      </div>
      <div role="alert" className="flex flex-col gap-2">
        {assertive.map((toast) => <ToastItem key={toast.id} toast={toast} dismissLabel={t('dismiss')} />)}
      </div>
    </div>
  );
}
