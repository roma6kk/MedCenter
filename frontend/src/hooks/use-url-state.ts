import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** Mirrors list state into the address bar without a navigation (Next syncs `useSearchParams` with `replaceState`). */
export function writeUrlQuery(query: string): void {
  const { pathname } = window.location;
  window.history.replaceState(window.history.state, '', query === '' ? pathname : `${pathname}?${query}`);
}

export function parsePage(value: string): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** String state kept in the address bar: read once from the URL, values equal to the default are left out of it. The page needs a Suspense boundary. */
export function useUrlState<K extends string>(defaults: Readonly<Record<K, string>>): readonly [Readonly<Record<K, string>>, (patch: Partial<Record<K, string>>) => void] {
  const params = useSearchParams();
  const [state, setState] = useState<Readonly<Record<K, string>>>(() => {
    const keys = Object.keys(defaults) as K[];
    return Object.fromEntries(keys.map((key) => [key, params.get(key) ?? defaults[key]])) as Record<K, string>;
  });
  const update = (patch: Partial<Record<K, string>>): void => {
    const next = { ...state, ...patch } as Record<K, string>;
    setState(next);
    const query = new URLSearchParams();
    (Object.keys(defaults) as K[]).forEach((key) => {
      if (next[key] !== defaults[key]) query.set(key, next[key]);
    });
    writeUrlQuery(query.toString());
  };
  return [state, update];
}
