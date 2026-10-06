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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
  const activeId: string | undefined = activeIndex !== null ? `${id}-option-${activeIndex}` : undefined;
  const select = (code: string): void => {
    setQuery(code);
    onChange(code);
    setActiveIndex(null);
  };
  const selectIndex = (index: number): void => {
    const term = items[index];
    if (term) select(term.code);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current === null ? 0 : Math.min(current + 1, items.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current === null ? items.length - 1 : Math.max(current - 1, 0)));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === 'Enter' && activeIndex !== null) {
      event.preventDefault();
      selectIndex(activeIndex);
    } else if (event.key === 'Escape') {
      setActiveIndex(null);
    }
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
        aria-activedescendant={activeId}
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setActiveIndex(null); }}
        onKeyDown={handleKeyDown}
        aria-invalid={!valid}
        aria-describedby={!valid ? errorId : undefined}
        className="mono mt-1 w-full rounded-[6px] border border-[var(--input)] p-2"
        placeholder="J06.9…"
        spellCheck={false}
        autoComplete="off"
      />
      {!valid ? <p id={errorId} role="alert" className="text-sm text-[var(--destructive)]">Некорректный код МКБ-10</p> : null}
      {items.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Варианты МКБ-10" className="mt-1 rounded-[6px] border border-[var(--border)]">
          {items.map((t, index) => (
            <li
              key={t.code}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex || t.code === query}
              onClick={() => select(t.code)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              className={`cursor-pointer px-2 py-1 text-sm hover:bg-[var(--secondary)] ${index === activeIndex ? 'bg-[var(--secondary)]' : ''}`}
            >
              {t.code} — {t.display}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
