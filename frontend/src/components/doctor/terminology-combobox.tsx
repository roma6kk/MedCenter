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
  readonly label: string;
  readonly valueSet: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelectTerm?: (term: Term) => void;
  readonly onBlur?: () => void;
  readonly pattern: RegExp;
  readonly invalidMessage: string;
  readonly listLabel: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly normalize?: (raw: string) => string;
  readonly error?: string;
  readonly text?: string;
  readonly onTextChange?: (raw: string) => void;
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
  readonly isShortcuts: boolean;
  readonly isSearching: boolean;
  readonly isEmpty: boolean;
  readonly isFailed: boolean;
  readonly retry: () => void;
}

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
    // Not tied to the open list: leaving the field (Tab to «Повторить») must not remove the notice.
    isFailed: query.length >= MIN_QUERY_LENGTH && isSettled && expansion.isError,
    retry: () => void expansion.refetch(),
  };
}

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
  readonly hint: string | undefined;
  readonly query: string;
  readonly state: SuggestionState;
}

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
          {/* The mouse press must not blur the field: that closes the list the retry should bring back. */}
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

function useComboboxModel(props: TerminologyComboboxProps): ComboboxModel {
  const { valueSet, value, onChange, onSelectTerm, onBlur, pattern, invalidMessage, normalize, error, text: ownerText, onTextChange, shortcuts = NO_TERMS } = props;
  const list = useListState();
  const [isTouched, setIsTouched] = useState(false);
  const [picked, setPicked] = useState<Term | null>(null);
  const text: string = ownerText ?? value;
  const state = useSuggestions(valueSet, text, list.isOpen, shortcuts);
  const isListVisible: boolean = list.isOpen && state.items.length > 0;
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
