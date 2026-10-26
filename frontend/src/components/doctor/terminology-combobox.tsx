'use client';

import { forwardRef, useEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FIELD_CLASS } from '@/components/ui/field-styles';
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
  /**
   * The text in the input, when it is not the code itself (a picked concept reads «J06.9 — Острый назофарингит»). With it the
   * input shows and searches this text, typing goes to `onTextChange`, and the owner decides which code (if any) the text is.
   */
  readonly text?: string;
  readonly onTextChange?: (raw: string) => void;
  /** Offered when the field is focused with (almost) nothing typed: the doctor's shortcuts (a patient's earlier diagnoses). */
  readonly shortcuts?: ReadonlyArray<Term>;
  readonly shortcutsLabel?: string;
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface SuggestionState {
  readonly items: ReadonlyArray<Term>;
  /** The items are the owner's shortcuts, not search results. */
  readonly isShortcuts: boolean;
  /** A search is typed and has not answered yet (the debounce, or the request). */
  readonly isSearching: boolean;
  /** The search answered with nothing. */
  readonly isEmpty: boolean;
  readonly isFailed: boolean;
  readonly retry: () => void;
}

/**
 * Suggestions for what is typed: held back until two characters, and only while the list is open and the text has settled.
 * Under that the field is always in exactly one of five states: shortcuts or nothing (too little typed), searching, results,
 * empty, failed; a silent field is how «ничего не происходит» (audit A7) happens.
 */
function useSuggestions(valueSet: string, query: string, isOpen: boolean, shortcuts: ReadonlyArray<Term>): SuggestionState {
  const debounced: string = useDebounced(query, DEBOUNCE_MS);
  const isSearch: boolean = isOpen && query.length >= MIN_QUERY_LENGTH;
  const expansion = useExpansion(valueSet, debounced, { enabled: isOpen && debounced.length >= MIN_QUERY_LENGTH, count: SUGGESTION_COUNT });
  const isSettled: boolean = debounced === query;
  const found: ReadonlyArray<Term> = isSearch && isSettled ? expansion.data?.items ?? [] : [];
  const isShortcuts: boolean = isOpen && query.length < MIN_QUERY_LENGTH && shortcuts.length > 0;
  return {
    items: isShortcuts ? shortcuts : found,
    isShortcuts,
    isSearching: isSearch && !expansion.isError && (!isSettled || expansion.isFetching),
    isEmpty: isSearch && isSettled && expansion.isSuccess && found.length === 0,
    // Not tied to the open list: leaving the field (Tab to «Повторить») must not take the notice, or its button, away.
    isFailed: query.length >= MIN_QUERY_LENGTH && isSettled && expansion.isError,
    retry: () => void expansion.refetch(),
  };
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
  readonly query: string;
  readonly state: SuggestionState;
}

/**
 * What is said under the input: the error (announced), the picked concept's name, and the state of the search: looking,
 * nothing found, or the terminology is down (with a retry; the code can still be typed and the server checks it on submit).
 */
function ComboboxMessages({ id, error, hint, query, state }: ComboboxMessagesProps): ReactNode {
  const t = useT('doctor.combobox');
  return (
    <>
      {error !== undefined ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">{error}</p> : null}
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      {state.isSearching ? <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t('loading')}</p> : null}
      {state.isEmpty ? <p role="status" className="mt-1 text-sm text-muted-foreground">{t('empty', { query })}</p> : null}
      {state.isFailed ? (
        <p role="status" className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-warning">
          <span>{t('unavailable')}</span>
          {/* The mouse press must not blur the field: that closes the list the retry is meant to bring back. */}
          <Button variant="ghost" onClick={state.retry} onMouseDown={(event) => event.preventDefault()}>{t('retry')}</Button>
        </p>
      ) : null}
    </>
  );
}

interface ComboboxInputProps {
  readonly props: TerminologyComboboxProps;
  readonly inputRef: React.ForwardedRef<HTMLInputElement>;
  readonly text: string;
  readonly isListVisible: boolean;
  readonly activeIndex: number | null;
  readonly shownError: string | undefined;
  readonly onType: (raw: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onFocus: () => void;
  readonly onLeave: () => void;
}

/** The labelled input of the combobox with its ARIA 1.2 attributes; all behaviour comes from the owner. */
function ComboboxInput({ props, inputRef, text, isListVisible, activeIndex, shownError, onType, onKeyDown, onFocus, onLeave }: ComboboxInputProps): ReactNode {
  const { id, label, maxLength, placeholder } = props;
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
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onType(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onLeave}
        // A bare code reads best in the monospace face; a line with a name («J06.9 — Острая инфекция…») is prose.
        className={`${props.text === undefined ? 'mono ' : ''}mt-1 ${FIELD_CLASS}`}
      />
    </>
  );
}

interface ComboboxModel {
  readonly list: ReturnType<typeof useListState>;
  readonly text: string;
  readonly picked: Term | null;
  readonly isListVisible: boolean;
  readonly state: SuggestionState;
  readonly shownError: string | undefined;
  readonly pick: (term: Term) => void;
  readonly handleType: (raw: string) => void;
  readonly handleFocus: () => void;
  readonly handleLeave: () => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Everything the combobox decides: the open list, the suggestions, the picked concept, which error shows, and the handlers. */
function useComboboxModel(props: TerminologyComboboxProps): ComboboxModel {
  const { valueSet, value, onChange, onSelectTerm, onBlur, pattern, invalidMessage, normalize, error, text: ownerText, onTextChange, shortcuts = NO_TERMS } = props;
  const list = useListState();
  const [isTouched, setIsTouched] = useState(false);
  const [picked, setPicked] = useState<Term | null>(null);
  const text: string = ownerText ?? value;
  const state = useSuggestions(valueSet, text, list.isOpen, shortcuts);
  const isListVisible: boolean = list.isOpen && state.items.length > 0;
  // A text that is not a code (a name being searched) is not an invalid code while the owner keeps the code empty only until a pick.
  const shownError: string | undefined = error ?? (isTouched && text !== '' && !pattern.test(value) ? invalidMessage : undefined);

  const pick = (term: Term): void => {
    setPicked(term);
    onChange(term.code);
    onSelectTerm?.(term);
    list.close();
  };
  const handleType = (raw: string): void => {
    if (onTextChange) onTextChange(raw);
    else onChange(normalize ? normalize(raw) : raw);
    list.open();
  };
  const handleFocus = (): void => {
    if (shortcuts.length > 0 && text.length < MIN_QUERY_LENGTH) list.open();
  };
  const handleLeave = (): void => {
    list.close();
    setIsTouched(true);
    onBlur?.();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void =>
    handleComboboxKey(event, { items: state.items, isListVisible, activeIndex: list.activeIndex, setActiveIndex: list.setActiveIndex, setIsOpen: list.setIsOpen, pick });
  return { list, text, picked, isListVisible, state, shownError, pick, handleType, handleFocus, handleLeave, handleKeyDown };
}

const NO_TERMS: ReadonlyArray<Term> = [];

/**
 * Search-as-you-type over a terminology ValueSet (`$expand`, API 2.3.2) with the ARIA 1.2 combobox pattern:
 * the input keeps focus, arrows move `aria-activedescendant`, Enter picks, Escape closes. Every state of the search is
 * visible: looking, nothing found, the terminology down (retry).
 */
export const TerminologyCombobox = forwardRef<HTMLInputElement, TerminologyComboboxProps>(function TerminologyCombobox(props, ref): ReactNode {
  const { id, value, listLabel, shortcutsLabel } = props;
  const model = useComboboxModel(props);
  const { list, picked, isListVisible, state } = model;
  return (
    <div>
      <ComboboxInput
        props={props}
        inputRef={ref}
        text={model.text}
        isListVisible={isListVisible}
        activeIndex={list.activeIndex}
        shownError={model.shownError}
        onType={model.handleType}
        onKeyDown={model.handleKeyDown}
        onFocus={model.handleFocus}
        onLeave={model.handleLeave}
      />
      <ComboboxMessages id={id} error={model.shownError} hint={props.text === undefined && picked?.code === value ? picked.display : undefined} query={model.text} state={state} />
      <SuggestionList
        id={`${id}-listbox`}
        optionPrefix={id}
        label={listLabel}
        heading={state.isShortcuts ? shortcutsLabel : undefined}
        items={state.items}
        isVisible={isListVisible}
        activeIndex={list.activeIndex}
        onActive={list.setActiveIndex}
        onPick={model.pick}
      />
    </div>
  );
});

interface SuggestionListProps {
  readonly id: string;
  readonly optionPrefix: string;
  readonly label: string;
  /** A caption above the options (the shortcuts say where they come from). */
  readonly heading: string | undefined;
  readonly items: ReadonlyArray<Term>;
  readonly isVisible: boolean;
  readonly activeIndex: number | null;
  readonly onActive: (index: number) => void;
  readonly onPick: (term: Term) => void;
}

function SuggestionList({ id, optionPrefix, label, heading, items, isVisible, activeIndex, onActive, onPick }: SuggestionListProps): ReactNode {
  if (!isVisible) return <ul id={id} role="listbox" aria-label={label} hidden />;
  return (
    <ul id={id} role="listbox" aria-label={label} className="mt-1 max-h-64 overflow-y-auto rounded-card border border-border bg-card py-1 shadow-elev-2">
      {heading ? <li role="presentation" className="px-3 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">{heading}</li> : null}
      {items.map((term, index) => (
        <li
          key={term.code}
          id={`${optionPrefix}-option-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(term)}
          onMouseEnter={() => onActive(index)}
          className={`cursor-pointer px-3 py-2 text-sm hover:bg-secondary ${index === activeIndex ? 'bg-secondary' : ''}`}
        >
          <span className="mono font-semibold">{term.code}</span>
          {term.display ? <span> — {term.display}</span> : null}
        </li>
      ))}
    </ul>
  );
}
