'use client';

import { useEffect, useState, type ChangeEvent } from 'react';

export interface DateDraft {
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => void;
}

/**
 * What a date field shows while the visitor types into it. A native date input reports a full date after every
 * segment (typing `2` of `25` first reports the 2nd), and the picker clamps a past day to today: a field that always
 * shows the searched day would put that day back and swallow the next key. So the field keeps the typed value, every
 * typed day is passed on, and the searched day (`committed`) is shown again once the field loses focus or the period
 * moves by other means.
 */
export function useDateDraft(committed: string, commit: (day: string) => void): DateDraft {
  const [draft, setDraft] = useState<string>(committed);
  useEffect(() => setDraft(committed), [committed]);
  return {
    value: draft,
    onChange: (event) => {
      setDraft(event.target.value);
      commit(event.target.value);
    },
    onBlur: () => setDraft(committed),
  };
}
