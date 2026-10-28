'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { useModalBehavior } from '@/hooks/use-modal-behavior';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';

export type DialogSize = 'sm' | 'md' | 'lg';
export type DialogVariant = 'dialog' | 'drawer' | 'drawer-left';

interface DialogProps {
  readonly title: string;
  /** Text under the title that says what the dialog is about; it also becomes the accessible description. */
  readonly description?: ReactNode;
  readonly onClose: () => void;
  readonly children?: ReactNode;
  /** Buttons row below the scrolling body (kept in view on a long form). */
  readonly footer?: ReactNode;
  readonly size?: DialogSize;
  readonly variant?: DialogVariant;
}

const SIZE_CLASS: Readonly<Record<DialogSize, string>> = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-4xl' };

/**
 * `dialog`: a centred window from 640 px up, a bottom sheet below it (thumb reach, the keyboard pushes it up instead of
 * covering the title). `drawer`: a panel on the right edge at every width; `drawer-left`: the same on the left edge, for a menu
 * whose burger button sits on the left (the panel grows out of the button that opened it).
 */
const OVERLAY_CLASS: Readonly<Record<DialogVariant, string>> = {
  dialog: 'items-end justify-center sm:items-center sm:p-4',
  drawer: 'items-stretch justify-end',
  'drawer-left': 'items-stretch justify-start',
};

const PANEL_CLASS: Readonly<Record<DialogVariant, string>> = {
  dialog: 'max-h-[90dvh] w-full rounded-t-panel border-x border-t animate-sheet-in sm:max-h-[calc(100dvh-2rem)] sm:animate-dialog-in sm:rounded-panel sm:border',
  drawer: 'h-full w-full max-w-sm border-l animate-drawer-in',
  'drawer-left': 'h-full w-full max-w-sm border-r animate-drawer-left-in',
};

/** The latest `onClose`, behind a callback that never changes: the focus trap must not restart when the parent re-renders. */
function useStableClose(onClose: () => void): () => void {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  return useCallback(() => latest.current(), []);
}

/**
 * The one modal window of the app (VE2): a scrim with a light blur, a raised panel (`shadow-elev-3`), a title, a close
 * button, a scrolling body and an optional footer. It enters with a fade and a scale from .96 (a slide from the bottom as a
 * sheet); reduced motion turns that off globally.
 *
 * Behaviour: labelled by its title, traps focus, closes on Escape, returns focus to the opener, locks the page behind it.
 * The close button sits last in the DOM (and in the Tab order) on purpose: the first control of the body takes the initial
 * focus, not the cross. Mount it only while it is open (`{open ? <Dialog …/> : null}`). A caller that must not be
 * dismissed while a request runs hands in an `onClose` that ignores the call.
 */
export function Dialog({ title, description, onClose, children, footer, size = 'md', variant = 'dialog' }: DialogProps): ReactNode {
  const t = useT('common');
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  const close = useStableClose(onClose);
  const trapFocus = useDialogFocus<HTMLDivElement>(true, close);
  useModalBehavior(panel);
  return (
    <div className={cn('fixed inset-0 z-40 flex animate-scrim-in bg-scrim backdrop-blur-sm', OVERLAY_CLASS[variant])}>
      <div
        ref={(node) => {
          panel.current = node;
          trapFocus(node);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        className={cn('relative flex flex-col border-border bg-card shadow-elev-3 focus:outline-none', PANEL_CLASS[variant], variant === 'dialog' && SIZE_CLASS[size])}
      >
        <div className="flex-none px-5 pb-2 pt-5 pr-14">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          {description === undefined ? null : (
            <div id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer === undefined ? null : <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-border-soft px-5 py-4">{footer}</div>}
        <button
          type="button"
          data-dialog-close=""
          onClick={close}
          aria-label={t('close')}
          className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] duration-fast ease-out hover:bg-secondary hover:text-foreground"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
