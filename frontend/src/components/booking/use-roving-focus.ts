'use client';

import { useRef, type KeyboardEvent, type RefObject } from 'react';

/** The elements of a roving group carry `data-roving`; one with `aria-disabled="true"` is skipped. */
const ITEM_SELECTOR = '[data-roving]';

type Layout = 'row' | 'grid';

interface RovingOptions {
  /** `row`: Left/Right only (a day strip); `grid`: Up/Down too, to the nearest item of the row above or below. */
  readonly layout: Layout;
  /** Radio behaviour: the item that receives focus is chosen at once (the arrows select, like a native radio group). */
  readonly selectOnMove?: boolean;
}

interface Roving<T extends HTMLElement> {
  readonly ref: RefObject<T>;
  readonly onKeyDown: (event: KeyboardEvent<T>) => void;
}

function enabledItems(container: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((item) => item.getAttribute('aria-disabled') !== 'true');
}

function centreX(rect: DOMRect): number {
  return rect.left + rect.width / 2;
}

/** The item of the nearest row above (`-1`) or below (`1`) that lies closest to the current one horizontally; `null` when there is none. */
function neighbourInColumn(items: ReadonlyArray<HTMLElement>, current: HTMLElement, direction: -1 | 1): HTMLElement | null {
  const from: DOMRect = current.getBoundingClientRect();
  const tops: ReadonlyArray<number> = items
    .map((item) => item.getBoundingClientRect().top)
    .filter((top) => (direction === 1 ? top > from.top + 1 : top < from.top - 1));
  if (tops.length === 0) return null;
  const nearestRow: number = direction === 1 ? Math.min(...tops) : Math.max(...tops);
  const row: ReadonlyArray<HTMLElement> = items.filter((item) => item.getBoundingClientRect().top === nearestRow);
  return row.reduce((best, item) => (Math.abs(centreX(item.getBoundingClientRect()) - centreX(from)) < Math.abs(centreX(best.getBoundingClientRect()) - centreX(from)) ? item : best));
}

function targetFor(key: string, items: ReadonlyArray<HTMLElement>, current: HTMLElement, layout: Layout): HTMLElement | null {
  const index: number = items.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return items[index + 1] ?? null;
    case 'ArrowLeft':
      return index > 0 ? (items[index - 1] ?? null) : null;
    case 'Home':
      return items[0] ?? null;
    case 'End':
      return items[items.length - 1] ?? null;
    case 'ArrowDown':
      return layout === 'grid' ? neighbourInColumn(items, current, 1) : null;
    case 'ArrowUp':
      return layout === 'grid' ? neighbourInColumn(items, current, -1) : null;
    default:
      return null;
  }
}

/**
 * Arrow-key movement inside a group of buttons (a day strip, a slot grid) without a tab stop per button: the group's
 * container gets `onKeyDown`, the buttons carry `data-roving` and take turns holding `tabIndex={0}`. Written for the
 * visible order, so it needs no ids and no state in the buttons.
 */
export function useRovingFocus<T extends HTMLElement>({ layout, selectOnMove = false }: RovingOptions): Roving<T> {
  const ref = useRef<T>(null);
  const onKeyDown = (event: KeyboardEvent<T>): void => {
    const container: T | null = ref.current;
    const current: HTMLElement | null = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ITEM_SELECTOR) : null;
    if (container === null || current === null || event.altKey || event.ctrlKey || event.metaKey) return;
    const target: HTMLElement | null = targetFor(event.key, enabledItems(container), current, layout);
    if (target === null) return;
    event.preventDefault();
    target.focus();
    if (selectOnMove) target.click();
  };
  return { ref, onKeyDown };
}
