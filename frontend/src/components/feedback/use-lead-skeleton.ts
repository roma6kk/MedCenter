'use client';

import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

interface MountedSkeleton {
  readonly id: string;
  readonly element: HTMLElement;
}

/** The skeletons on screen now, the earliest first. */
let mounted: readonly MountedSkeleton[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setMounted(next: readonly MountedSkeleton[]): void {
  mounted = next;
  listeners.forEach((listener) => listener());
}

/** A modal is a screen of its own: what is behind it is out of reach of a screen reader, so a skeleton inside it cannot lean on one outside. */
function scopeOf(element: HTMLElement): Element | null {
  return element.closest('[aria-modal="true"]');
}

/** A skeleton that has not registered yet (the first render, the server) is its own lead: a lone skeleton must never be mute. */
function isLead(id: string): boolean {
  const own: MountedSkeleton | undefined = mounted.find((entry) => entry.id === id);
  if (own === undefined) return true;
  const scope: Element | null = scopeOf(own.element);
  return mounted.find((entry) => scopeOf(entry.element) === scope)?.id === id;
}

interface LeadSkeleton<T extends HTMLElement> {
  /** Goes on the root element of the skeleton: its place in the page tells which modal, if any, it belongs to. */
  readonly ref: RefObject<T>;
  /** Only the lead skeleton of a screen is the `role="status"` region and shows the slow-loading note; the others are decoration. */
  readonly isLead: boolean;
}

/**
 * Several reads in flight at once (the doctor's patient card loads the header, the history and the orders side by side) draw
 * several skeletons, and each of them used to be a live region of its own: a screen reader said «Загрузка…» three times and
 * the eye saw three «Загружаем…» after three seconds. The skeleton that mounted first is the lead one (the region and the
 * note); when it goes away, the next one takes over, so the wait of the screen is announced once for as long as it lasts.
 */
export function useLeadSkeleton<T extends HTMLElement>(): LeadSkeleton<T> {
  const id: string = useId();
  const ref = useRef<T>(null);
  useEffect(() => {
    const element: T | null = ref.current;
    if (element === null) return undefined;
    const entry: MountedSkeleton = { id, element };
    setMounted([...mounted, entry]);
    return () => setMounted(mounted.filter((candidate) => candidate !== entry));
  }, [id]);
  const isLeadNow: boolean = useSyncExternalStore(
    subscribe,
    () => isLead(id),
    () => true,
  );
  return { ref, isLead: isLeadNow };
}
