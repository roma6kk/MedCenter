'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export interface SegmentOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export type SegmentedKind = 'tabs' | 'toggle';

interface SegmentedControlProps<TValue extends string> {
  readonly label: string;
  readonly options: ReadonlyArray<SegmentOption<TValue>>;
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
  readonly kind?: SegmentedKind;
  readonly idPrefix?: string;
  readonly size?: 'md' | 'sm';
  readonly className?: string;
}

export function tabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

function targetIndex(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function useIndicator(selected: string, segments: React.MutableRefObject<Map<string, HTMLButtonElement>>): { readonly box: Box | null; readonly ref: (node: HTMLDivElement | null) => void; readonly animate: boolean } {
  const [box, setBox] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);
  const measure = useCallback((): void => {
    const node: HTMLButtonElement | undefined = segments.current.get(selected);
    if (node === undefined) return;
    setBox((previous) => {
      const next: Box = { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight };
      return previous !== null && previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height ? previous : next;
    });
  }, [selected, segments]);
  useLayoutEffect(() => {
    measure();
    const frame: number = requestAnimationFrame(() => setAnimate(true));
    const observer: ResizeObserver | null = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (container.current !== null) observer?.observe(container.current);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [measure]);
  const ref = useCallback((node: HTMLDivElement | null): void => {
    container.current = node;
  }, []);
  return { box, ref, animate };
}

const SIZE_CLASS: Readonly<Record<NonNullable<SegmentedControlProps<string>['size']>, string>> = {
  md: 'min-h-[44px] px-4 text-base',
  sm: 'min-h-[44px] min-w-[44px] px-2 text-xs uppercase',
};

export function SegmentedControl<TValue extends string>({ label, options, value, onChange, kind = 'tabs', idPrefix = 'seg', size = 'md', className }: SegmentedControlProps<TValue>): ReactNode {
  const segments = useRef<Map<string, HTMLButtonElement>>(new Map());
  const { box, ref, animate } = useIndicator(value, segments);
  const isTabs: boolean = kind === 'tabs';
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (!isTabs) return;
    const target: number | null = targetIndex(event.key, index, options.length);
    const option: SegmentOption<TValue> | undefined = target === null ? undefined : options[target];
    if (target === null || option === undefined) return;
    event.preventDefault();
    onChange(option.value);
    segments.current.get(option.value)?.focus();
  };
  const indicatorStyle: CSSProperties | undefined =
    box === null ? undefined : { width: box.width, height: box.height, transform: `translate(${box.left}px, ${box.top}px)` };
  return (
    <div
      ref={ref}
      role={isTabs ? 'tablist' : 'group'}
      aria-label={label}
      className={cn('no-print relative inline-flex max-w-full flex-wrap gap-1 self-start rounded-card bg-secondary p-1', className)}
    >
      <span
        aria-hidden="true"
        data-testid="segmented-indicator"
        style={indicatorStyle}
        className={cn(
          'pointer-events-none absolute left-0 top-0 rounded-control bg-card shadow-elev-1',
          box === null && 'opacity-0',
          animate && 'transition-[transform,width,height] duration-base ease-out',
        )}
      />
      {options.map((option, index) => {
        const isSelected: boolean = option.value === value;
        const common = {
          ref: (node: HTMLButtonElement | null): void => {
            if (node === null) segments.current.delete(option.value);
            else segments.current.set(option.value, node);
          },
          type: 'button' as const,
          onClick: () => onChange(option.value),
          onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index),
          className: cn(
            'relative z-10 rounded-control transition-colors duration-fast ease-out',
            SIZE_CLASS[size],
            isSelected ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
          ),
        };
        return isTabs ? (
          <button key={option.value} {...common} role="tab" id={tabId(idPrefix, option.value)} aria-selected={isSelected} aria-controls={`${idPrefix}-panel`} tabIndex={isSelected ? 0 : -1}>
            {option.label}
          </button>
        ) : (
          <button key={option.value} {...common} aria-pressed={isSelected}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
