import type { KeyboardEvent } from 'react';
import type { Term } from './doctor-types';

export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 250;

const NAVIGATION_KEYS: ReadonlyArray<string> = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/** Where `aria-activedescendant` moves for a navigation key (`null` = nothing active yet). */
export function nextIndex(key: string, current: number | null, last: number): number | null {
  if (key === 'ArrowDown') return current === null ? 0 : Math.min(current + 1, last);
  if (key === 'ArrowUp') return current === null ? last : Math.max(current - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return current;
}

export interface ComboboxKeyContext {
  readonly items: ReadonlyArray<Term>;
  readonly isListVisible: boolean;
  readonly activeIndex: number | null;
  readonly setActiveIndex: (index: number | null) => void;
  readonly setIsOpen: (isOpen: boolean) => void;
  readonly pick: (term: Term) => void;
}

/** ARIA 1.2 combobox keys: arrows/Home/End move the active option, Enter picks it, Escape closes the list. */
export function handleComboboxKey(event: KeyboardEvent<HTMLInputElement>, context: ComboboxKeyContext): void {
  const { items, isListVisible, activeIndex, setActiveIndex, setIsOpen, pick } = context;
  const active: Term | undefined = activeIndex === null ? undefined : items[activeIndex];
  if (event.key === 'Escape') {
    setIsOpen(false);
    setActiveIndex(null);
  } else if (event.key === 'Enter' && isListVisible && active !== undefined) {
    event.preventDefault();
    pick(active);
  } else if (NAVIGATION_KEYS.includes(event.key) && items.length > 0) {
    event.preventDefault();
    setIsOpen(true);
    setActiveIndex(nextIndex(event.key, activeIndex, items.length - 1));
  }
}
