'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'medcenter.profile.hiddenRecommendations.';

function read(key: string): ReadonlyArray<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: ReadonlyArray<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Private mode or a full quota: the choice then lives until the page is closed, which is still what the button promised.
  }
}

export interface HiddenRecommendations {
  readonly hidden: ReadonlyArray<string>;
  readonly hide: (id: string) => void;
  readonly restore: () => void;
}

/** The recommendations the patient dismissed, remembered in this browser per patient id (no backend for it). Read after mount, so the server markup matches. */
export function useHiddenRecommendations(patientId: string | undefined): HiddenRecommendations {
  const key: string | undefined = patientId === undefined ? undefined : `${KEY_PREFIX}${patientId}`;
  const [hidden, setHidden] = useState<ReadonlyArray<string>>([]);
  useEffect(() => {
    setHidden(key === undefined ? [] : read(key));
  }, [key]);
  const hide = useCallback(
    (id: string) => {
      setHidden((current) => {
        const next: ReadonlyArray<string> = current.includes(id) ? current : [...current, id];
        if (key !== undefined) write(key, next);
        return next;
      });
    },
    [key],
  );
  const restore = useCallback(() => {
    setHidden([]);
    if (key !== undefined) write(key, []);
  }, [key]);
  return { hidden, hide, restore };
}
