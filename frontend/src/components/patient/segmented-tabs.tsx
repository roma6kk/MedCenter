'use client';

import type { ReactNode } from 'react';
import { SegmentedControl, tabId } from '@/components/ui/segmented-control';

export { tabId };

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

/** The props the single panel that follows the tabs needs to be announced as the panel of the selected tab. */
export function tabPanelProps(idPrefix: string, value: string): { readonly id: string; readonly role: 'tabpanel'; readonly 'aria-labelledby': string } {
  return { id: `${idPrefix}-panel`, role: 'tabpanel', 'aria-labelledby': tabId(idPrefix, value) };
}

/** Two or three tabs that switch one panel: the WAI-ARIA tabs pattern, drawn by the shared sliding-indicator control. */
export function SegmentedTabs<TValue extends string>({ idPrefix, label, options, value, onChange }: SegmentedTabsProps<TValue>): ReactNode {
  return <SegmentedControl kind="tabs" idPrefix={idPrefix} label={label} options={options} value={value} onChange={onChange} />;
}
