'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { useModalBehavior } from './use-modal-behavior';

export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalVariant = 'dialog' | 'drawer';

interface ModalProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly size?: ModalSize;
  readonly variant?: ModalVariant;
}

const SIZE_CLASS: Readonly<Record<ModalSize, string>> = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-4xl' };

const PANEL_CLASS: Readonly<Record<ModalVariant, string>> = {
  dialog: 'my-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-5',
  drawer: 'fixed inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l border-[var(--border)] bg-[var(--card)] p-5',
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
 * Modal dialog or side drawer: labelled by its title, traps focus, closes on Escape and returns focus to the opener.
 * Mount it only while it is open (`{open ? <Modal …/> : null}`). The first focusable element receives focus (the panel
 * itself until there is one), the page behind does not scroll, and a closed dialog never leaves the focus on `body`.
 */
export function Modal({ title, onClose, children, size = 'md', variant = 'dialog' }: ModalProps): ReactNode {
  const titleId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  const trapFocus = useDialogFocus<HTMLDivElement>(true, useStableClose(onClose));
  useModalBehavior(panel);
  const panelClass: string = variant === 'dialog' ? `${PANEL_CLASS.dialog} ${SIZE_CLASS[size]}` : PANEL_CLASS.drawer;
  const overlayClass: string =
    variant === 'dialog' ? 'flex items-start justify-center overflow-y-auto p-4' : '';
  return (
    <div className={`fixed inset-0 z-40 bg-black/30 ${overlayClass}`}>
      <div
        ref={(node) => {
          panel.current = node;
          trapFocus(node);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={panelClass}
      >
        <h2 id={titleId} className="serif text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
