'use client';

import type { ReactNode } from 'react';
import { SegmentedControl, tabId } from '@/components/ui/segmented-control';

export interface TabOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

interface SegmentedTabsProps<TValue extends string> {
  readonly idPrefix: string;
  readonly label: string;
  readonly options: ReadonlyArray<TabOption<TValue>>;
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
}

export function tabPanelProps(idPrefix: string, value: string): { readonly id: string; readonly role: 'tabpanel'; readonly 'aria-labelledby': string } {
  return { id: `${idPrefix}-panel`, role: 'tabpanel', 'aria-labelledby': tabId(idPrefix, value) };
}

export function SegmentedTabs<TValue extends string>({ idPrefix, label, options, value, onChange }: SegmentedTabsProps<TValue>): ReactNode {
  return <SegmentedControl kind="tabs" idPrefix={idPrefix} label={label} options={options} value={value} onChange={onChange} />;
}
