'use client';

import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

interface SegmentedTabsProps<TValue extends string> {
  /** Makes the tab and panel ids unique on the page. */
  readonly idPrefix: string;
  /** Accessible name of the tab list. */
  readonly label: string;
  readonly options: ReadonlyArray<TabOption<TValue>>;
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
}

export function tabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

/** The props the single panel that follows the tabs needs to be announced as the panel of the selected tab. */
export function tabPanelProps(idPrefix: string, value: string): { readonly id: string; readonly role: 'tabpanel'; readonly 'aria-labelledby': string } {
  return { id: `${idPrefix}-panel`, role: 'tabpanel', 'aria-labelledby': tabId(idPrefix, value) };
}

/** Arrow keys wrap around, Home/End jump to the ends; any other key is not ours. */
function targetIndex(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

interface TabButtonProps {
  readonly idPrefix: string;
  readonly value: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
}

function TabButton({ idPrefix, value, label, selected, onSelect, onKeyDown, buttonRef }: TabButtonProps): ReactNode {
  const state: string = selected ? 'border-[var(--primary)] font-semibold' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]';
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={tabId(idPrefix, value)}
      aria-selected={selected}
      aria-controls={`${idPrefix}-panel`}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`min-h-[44px] border-b-2 px-4 text-sm ${state}`}
    >
      {label}
    </button>
  );
}

/** Two or three tabs that switch one panel: the WAI-ARIA tabs pattern with roving tabindex and automatic activation. */
export function SegmentedTabs<TValue extends string>({ idPrefix, label, options, value, onChange }: SegmentedTabsProps<TValue>): ReactNode {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const target: number | null = targetIndex(event.key, index, options.length);
    const option: TabOption<TValue> | undefined = target === null ? undefined : options[target];
    if (target === null || option === undefined) return;
    event.preventDefault();
    onChange(option.value);
    buttons.current[target]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="no-print flex flex-wrap gap-1 border-b border-[var(--border)]">
      {options.map((option, index) => (
        <TabButton
          key={option.value}
          idPrefix={idPrefix}
          value={option.value}
          label={option.label}
          selected={option.value === value}
          onSelect={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          buttonRef={(node) => {
            buttons.current[index] = node;
          }}
        />
      ))}
    </div>
  );
}
