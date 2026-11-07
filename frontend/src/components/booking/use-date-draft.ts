'use client';

import { useEffect, useState } from 'react';

interface DateDraft {
  readonly value: string;
  readonly onChange: (day: string) => void;
  readonly onBlur: () => void;
}

/** A native date input reports a full date after every segment and the picker clamps a past day, so the field keeps what is typed until blur. */
export function useDateDraft(committed: string, commit: (day: string) => void): DateDraft {
  const [draft, setDraft] = useState<string>(committed);
  useEffect(() => setDraft(committed), [committed]);
  return {
    value: draft,
    onChange: (day) => {
      setDraft(day);
      commit(day);
    },
    onBlur: () => setDraft(committed),
  };
}
