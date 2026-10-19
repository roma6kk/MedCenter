'use client';

import { forwardRef, useEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { handleComboboxKey, DEBOUNCE_MS, MIN_QUERY_LENGTH } from './combobox-keys';
import { SUGGESTION_COUNT } from './doctor-api';
import type { Term } from './doctor-types';
import { useExpansion } from './use-doctor-queries';

export interface TerminologyComboboxProps {
  readonly id: string;
  /** Visible label; the input is named by it. */
  readonly label: string;
  /** ValueSet canonical the suggestions come from (`https://fhir.by/ValueSet/...`). */
  readonly valueSet: string;
  /** The code in the field. Free typing stays possible: the service re-validates every code on submit (BR-004, BR-009). */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called when a suggestion is picked (the owner can copy its display name into a sibling field). */
  readonly onSelectTerm?: (term: Term) => void;
  readonly onBlur?: () => void;
  /** Client mask: a typed value that does not match it is flagged once the field loses focus. */
  readonly pattern: RegExp;
  readonly invalidMessage: string;
  /** Text of the suggestion list for assistive technology. */
  readonly listLabel: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  /** Shapes what is typed (upper-casing a code); applied before `onChange`. */
  readonly normalize?: (raw: string) => string;
  /** A message from the form (zod or the server); wins over the mask message. */
  readonly error?: string;
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Suggestions for what is typed: held back until two characters, and only while the list is open and the text has settled. */
function useSuggestions(valueSet: string, value: string, isOpen: boolean): { readonly items: ReadonlyArray<Term>; readonly isFailed: boolean } {
  const debounced: string = useDebounced(value, DEBOUNCE_MS);
  const expansion = useExpansion(valueSet, debounced, { enabled: isOpen && debounced.length >= MIN_QUERY_LENGTH, count: SUGGESTION_COUNT });
  const items: ReadonlyArray<Term> = isOpen && debounced === value ? expansion.data?.items ?? [] : [];
  return { items, isFailed: expansion.isError && isOpen };
}

/** Whether the suggestion list is open and which option is active; closing always forgets the active option. */
function useListState(): {
  readonly isOpen: boolean;
  readonly activeIndex: number | null;
  readonly setIsOpen: (isOpen: boolean) => void;
  readonly setActiveIndex: (index: number | null) => void;
  readonly open: () => void;
  readonly close: () => void;
} {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const open = (): void => {
    setIsOpen(true);
    setActiveIndex(null);
  };
  const close = (): void => {
    setIsOpen(false);
    setActiveIndex(null);
  };
  return { isOpen, activeIndex, setIsOpen, setActiveIndex, open, close };
}

interface ComboboxMessagesProps {
  readonly id: string;
  readonly error: string | undefined;
  /** The name of the picked concept, shown under the field while its code is still the value. */
  readonly hint: string | undefined;
  readonly isFailed: boolean;
}

/** What is said under the input: the error (announced), the picked concept's name, a notice that suggestions are down. */
function ComboboxMessages({ id, error, hint, isFailed }: ComboboxMessagesProps): ReactNode {
  const t = useT('doctor.combobox');
  return (
    <>
      {error !== undefined ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-[var(--destructive)]">{error}</p> : null}
      {hint ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{hint}</p> : null}
      {isFailed ? <p role="status" className="mt-1 text-sm text-[var(--warning)]">{t('unavailable')}</p> : null}
    </>
  );
}

interface ComboboxInputProps {
  readonly props: TerminologyComboboxProps;
  readonly inputRef: React.ForwardedRef<HTMLInputElement>;
  readonly isListVisible: boolean;
  readonly activeIndex: number | null;
  readonly shownError: string | undefined;
  readonly onType: (raw: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onLeave: () => void;
}

/** The labelled input of the combobox with its ARIA 1.2 attributes; all behaviour comes from the owner. */
function ComboboxInput({ props, inputRef, isListVisible, activeIndex, shownError, onType, onKeyDown, onLeave }: ComboboxInputProps): ReactNode {
  const { id, label, value, maxLength, placeholder } = props;
  return (
    <>
      <label htmlFor={id} className="form-label block">{label}</label>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={isListVisible}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={isListVisible && activeIndex !== null ? `${id}-option-${activeIndex}` : undefined}
        aria-invalid={shownError !== undefined}
        aria-describedby={shownError !== undefined ? `${id}-error` : undefined}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onType(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onLeave}
        className="mono mt-1 min-h-[44px] w-full rounded-[6px] border border-[var(--input)] bg-[var(--card)] p-2"
      />
    </>
  );
}

interface ComboboxModel {
  readonly list: ReturnType<typeof useListState>;
  readonly picked: Term | null;
  readonly isListVisible: boolean;
  readonly items: ReadonlyArray<Term>;
  readonly isFailed: boolean;
  readonly shownError: string | undefined;
  readonly pick: (term: Term) => void;
  readonly handleType: (raw: string) => void;
  readonly handleLeave: () => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Everything the combobox decides: the open list, the suggestions, the picked concept, which error shows, and the three handlers. */
function useComboboxModel(props: TerminologyComboboxProps): ComboboxModel {
  const { valueSet, value, onChange, onSelectTerm, onBlur, pattern, invalidMessage, normalize, error } = props;
  const list = useListState();
  const [isTouched, setIsTouched] = useState(false);
  const [picked, setPicked] = useState<Term | null>(null);
  const { items, isFailed } = useSuggestions(valueSet, value, list.isOpen);
  const isListVisible: boolean = list.isOpen && items.length > 0;
  const shownError: string | undefined = error ?? (isTouched && value !== '' && !pattern.test(value) ? invalidMessage : undefined);

  const pick = (term: Term): void => {
    setPicked(term);
    onChange(term.code);
    onSelectTerm?.(term);
    list.close();
  };
  const handleType = (raw: string): void => {
    onChange(normalize ? normalize(raw) : raw);
    list.open();
  };
  const handleLeave = (): void => {
    list.close();
    setIsTouched(true);
    onBlur?.();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void =>
    handleComboboxKey(event, { items, isListVisible, activeIndex: list.activeIndex, setActiveIndex: list.setActiveIndex, setIsOpen: list.setIsOpen, pick });
  return { list, picked, isListVisible, items, isFailed, shownError, pick, handleType, handleLeave, handleKeyDown };
}

/**
 * Search-as-you-type over a terminology ValueSet (`$expand`, API 2.3.2) with the ARIA 1.2 combobox pattern:
 * the input keeps focus, arrows move `aria-activedescendant`, Enter picks, Escape closes.
 */
export const TerminologyCombobox = forwardRef<HTMLInputElement, TerminologyComboboxProps>(function TerminologyCombobox(props, ref): ReactNode {
  const { id, value, listLabel } = props;
  const model = useComboboxModel(props);
  const { list, picked, isListVisible, items } = model;
  return (
    <div>
      <ComboboxInput
        props={props}
        inputRef={ref}
        isListVisible={isListVisible}
        activeIndex={list.activeIndex}
        shownError={model.shownError}
        onType={model.handleType}
        onKeyDown={model.handleKeyDown}
        onLeave={model.handleLeave}
      />
      <ComboboxMessages id={id} error={model.shownError} hint={picked?.code === value ? picked.display : undefined} isFailed={model.isFailed} />
      <Suggestions id={`${id}-listbox`} optionPrefix={id} label={listLabel} items={items} isVisible={isListVisible} activeIndex={list.activeIndex} onActive={list.setActiveIndex} onPick={model.pick} />
    </div>
  );
});

interface SuggestionsProps {
  readonly id: string;
  readonly optionPrefix: string;
  readonly label: string;
  readonly items: ReadonlyArray<Term>;
  readonly isVisible: boolean;
  readonly activeIndex: number | null;
  readonly onActive: (index: number) => void;
  readonly onPick: (term: Term) => void;
}

function Suggestions({ id, optionPrefix, label, items, isVisible, activeIndex, onActive, onPick }: SuggestionsProps): ReactNode {
  if (!isVisible) return <ul id={id} role="listbox" aria-label={label} hidden />;
  return (
    <ul id={id} role="listbox" aria-label={label} className="mt-1 max-h-64 overflow-y-auto rounded-[6px] border border-[var(--border)] bg-[var(--card)]">
      {items.map((term, index) => (
        <li
          key={term.code}
          id={`${optionPrefix}-option-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(term)}
          onMouseEnter={() => onActive(index)}
          className={`cursor-pointer px-2 py-1.5 text-sm hover:bg-[var(--secondary)] ${index === activeIndex ? 'bg-[var(--secondary)]' : ''}`}
        >
          <span className="mono">{term.code}</span>
          {term.display ? <span> — {term.display}</span> : null}
        </li>
      ))}
    </ul>
  );
}
