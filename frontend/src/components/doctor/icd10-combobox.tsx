'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { ICD10_PATTERN } from '@/lib/contracts';

interface Term { readonly code: string; readonly display: string; }

interface Icd10ComboboxProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly id?: string;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function Icd10Combobox({ value, onChange, id = 'icd10' }: Icd10ComboboxProps): React.JSX.Element {
  const listboxId: string = `${id}-listbox`;
  const errorId: string = `${id}-error`;
  const [query, setQuery] = useState(value);
  const debounced: string = useDebouncedValue(query, 250);
  const { data } = useQuery({
    queryKey: ['valueSets', 'icd10', debounced],
    queryFn: ({ signal }) =>
      apiFetch<{ items: Term[] }>(
        `/api/v1/terminology/expand?system=https://fhir.by/ValueSet/InternClassificDiseases10&filter=${encodeURIComponent(debounced)}`,
        { signal },
      ),
    enabled: debounced.length >= 2,
    staleTime: 3_600_000,
  });
  const valid: boolean = query === '' || ICD10_PATTERN.test(query);
  const items: ReadonlyArray<Term> = data?.items ?? [];
  const select = (code: string): void => {
    setQuery(code);
    onChange(code);
  };
  return (
    <div>
      <label htmlFor={id} className="form-label block">Код МКБ-10</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
        aria-invalid={!valid}
        aria-describedby={!valid ? errorId : undefined}
        className="mono mt-1 w-full rounded-[6px] border border-[var(--input)] p-2"
        placeholder="J06.9"
      />
      {!valid ? <p id={errorId} role="alert" className="text-sm text-[var(--destructive)]">Некорректный код МКБ-10</p> : null}
      {items.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Варианты МКБ-10" className="mt-1 rounded-[6px] border border-[var(--border)]">
          {items.map((t) => (
            <li
              key={t.code}
              role="option"
              aria-selected={t.code === query}
              tabIndex={0}
              onClick={() => select(t.code)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.code); } }}
              className="cursor-pointer px-2 py-1 text-sm hover:bg-[var(--secondary)]"
            >
              {t.code} — {t.display}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
