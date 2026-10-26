import { useEffect, useRef } from 'react';

/** The close cross of a dialog: it stays in the Tab cycle but never takes the initial focus (the body's first control does). */
export const DIALOG_CLOSE_ATTRIBUTE = 'data-dialog-close'; // set by `Dialog`

/** Traps Tab inside `container`, focuses the first focusable child (not the close cross; the container itself when there is none), closes on Escape. */
export function useDialogFocus<TElement extends HTMLElement>(open: boolean, onClose: () => void): React.RefCallback<TElement> {
  const containerRef = useRef<TElement | null>(null);
  const previousFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    const container = containerRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    const initial: HTMLElement | undefined = Array.from(focusables).find((element) => !element.hasAttribute(DIALOG_CLOSE_ATTRIBUTE));
    (initial ?? container).focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [open, onClose]);
  return (node: TElement | null): void => {
    containerRef.current = node;
  };
}
