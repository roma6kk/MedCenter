'use client';

import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

interface MountedSkeleton {
  readonly id: string;
  readonly element: HTMLElement;
}

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

// A modal is a screen of its own: a skeleton inside it cannot lean on one outside.
function scopeOf(element: HTMLElement): Element | null {
  return element.closest('[aria-modal="true"]');
}

function isLead(id: string): boolean {
  const own: MountedSkeleton | undefined = mounted.find((entry) => entry.id === id);
  if (own === undefined) return true;
  const scope: Element | null = scopeOf(own.element);
  return mounted.find((entry) => scopeOf(entry.element) === scope)?.id === id;
}

interface LeadSkeleton<T extends HTMLElement> {
  readonly ref: RefObject<T>;
  readonly isLead: boolean;
}

// One live region per screen: several skeletons at once would make a screen reader say Загрузка… repeatedly.
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
