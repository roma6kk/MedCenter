'use client';

import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FocusEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  clampKey,
  formatTypedDate,
  keyOf,
  monthGrid,
  monthNames,
  parseTypedDate,
  partsOf,
  weekdayIndex,
  weekdayNames,
  daysInMonth,
} from '@/lib/calendar-grid';
import { clinicDateKey, formatDateKey, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { FIELD_CLASS, FIELD_NARROW_CLASS } from './field-styles';
import { useFloatingPosition } from './floating';
import { Select } from './select';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'defaultValue' | 'size'> {
  /** ISO day `YYYY-MM-DD`, or `''` while there is no day. The form value stays ISO whatever the field shows. */
  readonly value: string;
  /** Called with a real ISO day, or `''` when the text is cleared or is not (yet) a day. */
  readonly onChange: (value: string) => void;
  /** Earliest and latest day the calendar offers (ISO). A typed day outside them is passed on: the form's schema judges it. */
  readonly min?: string;
  readonly max?: string;
  /** Classes of the box around the field (its width): a date is a short value, so it is narrow by default. */
  readonly wrapperClassName?: string;
}

const POPOVER_WIDTH_PX = 326;
const YEARS_BEFORE = 120;
const YEARS_AFTER = 10;

const DAY_BASE =
  'inline-flex size-11 items-center justify-center rounded-control text-sm tabular-nums transition-[background-color,color,box-shadow] duration-fast ease-out focus-visible:outline-none focus-visible:shadow-focus';

/** Selected: solid primary; today: a primary ring; outside the month: muted; outside min/max: struck out and inert. */
function dayClass(isSelected: boolean, isToday: boolean, inMonth: boolean): string {
  return cn(
    DAY_BASE,
    'enabled:hover:bg-primary-soft disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-40',
    inMonth ? 'text-foreground' : 'text-muted-foreground',
    isToday && 'ring-1 ring-inset ring-primary',
    isSelected && 'bg-primary font-semibold text-primary-foreground enabled:hover:bg-primary-hover',
  );
}

interface CalendarPopoverProps {
  readonly anchor: HTMLElement | null;
  readonly value: string;
  readonly min: string | undefined;
  readonly max: string | undefined;
  readonly onSelect: (key: string) => void;
  readonly onClose: (restoreFocus: boolean) => void;
}

/** A month that lies wholly before `min` or after `max` cannot be picked. */
function isMonthOutside(year: number, month: number, min: string | undefined, max: string | undefined): boolean {
  const first: string = keyOf({ year, month, day: 1 });
  const last: string = keyOf({ year, month, day: daysInMonth(year, month) });
  return (min !== undefined && isDateKey(min) && last < min) || (max !== undefined && isDateKey(max) && first > max);
}

const inRange = (key: string, min: string | undefined, max: string | undefined): boolean => clampKey(key, min, max) === key;

/** Where the keyboard moves the focused day, per the WAI-ARIA date picker grid (arrows, Home/End of the week, PageUp/PageDown by month, Shift for a year). */
function moveTarget(key: string, cursor: string): string | null {
  const keyMove: Readonly<Record<string, string>> = {
    ArrowLeft: shiftDateKey(cursor, -1),
    ArrowRight: shiftDateKey(cursor, 1),
    ArrowUp: shiftDateKey(cursor, -7),
    ArrowDown: shiftDateKey(cursor, 7),
    Home: shiftDateKey(cursor, -weekdayIndex(cursor)),
    End: shiftDateKey(cursor, 6 - weekdayIndex(cursor)),
    PageUp: addMonths(cursor, -1),
    PageDown: addMonths(cursor, 1),
  };
  return keyMove[key] ?? null;
}

function CalendarPopover({ anchor, value, min, max, onSelect, onClose }: CalendarPopoverProps): ReactNode {
  const t = useT('ui.datePicker');
  const locale = useUiStore((state) => state.locale);
  const panel = useRef<HTMLDivElement>(null);
  const today: string = clinicDateKey();
  const [cursor, setCursor] = useState<string>(() => clampKey(isDateKey(value) ? value : today, min, max));
  // The grid takes the focus on open and after a keyboard move; a click in the header keeps the focus where it is.
  const focusGrid = useRef<boolean>(true);
  const position = useFloatingPosition({ anchor, panel, align: 'start', width: POPOVER_WIDTH_PX, onOutsidePress: () => onClose(false) });
  const months: ReadonlyArray<string> = monthNames(locale);
  const weekdaysShort: ReadonlyArray<string> = weekdayNames(locale, 'short');
  const weekdaysLong: ReadonlyArray<string> = weekdayNames(locale, 'long');
  const { year, month } = partsOf(cursor);
  const todayYear: number = partsOf(today).year;
  const firstYear: number = min !== undefined && isDateKey(min) ? partsOf(min).year : Math.min(todayYear - YEARS_BEFORE, year);
  const lastYear: number = max !== undefined && isDateKey(max) ? partsOf(max).year : Math.max(todayYear + YEARS_AFTER, year);
  const gridId: string = useId();

  const isPlaced: boolean = position !== null;
  useEffect(() => {
    if (!focusGrid.current || !isPlaced) return;
    panel.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
  }, [cursor, isPlaced]);

  const moveCursor = (target: string, takeFocus: boolean): void => {
    focusGrid.current = takeFocus;
    setCursor(clampKey(target, min, max));
  };
  const changeMonthYear = (nextYear: number, nextMonth: number): void =>
    moveCursor(keyOf({ year: nextYear, month: nextMonth, day: Math.min(partsOf(cursor).day, daysInMonth(nextYear, nextMonth)) }), false);

  const handleGridKey = (event: KeyboardEvent<HTMLElement>): void => {
    const shifted: string | null = event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown') ? addMonths(cursor, event.key === 'PageUp' ? -12 : 12) : moveTarget(event.key, cursor);
    if (shifted === null) return;
    event.preventDefault();
    moveCursor(shifted, true);
  };

  /** Escape closes only the calendar (the dialog behind it must stay); Tab cycles inside it because the portal sits at the end of `body`. */
  const handlePanelKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const stops: ReadonlyArray<HTMLElement> = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), select') ?? []);
    const first: HTMLElement | undefined = stops[0];
    const last: HTMLElement | undefined = stops[stops.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const weeks = monthGrid(cursor);
  const monthLabel: string = `${months[month - 1] ?? ''} ${year}`;
  const canGoPrev: boolean = min === undefined || !isDateKey(min) || keyOf({ year, month, day: 1 }) > min;
  const canGoNext: boolean = max === undefined || !isDateKey(max) || keyOf({ year, month, day: daysInMonth(year, month) }) < max;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={t('dialog')}
      onKeyDown={handlePanelKey}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width: POPOVER_WIDTH_PX }}
      className={cn('fixed z-50 animate-menu-in rounded-card border border-border bg-card p-2 shadow-elev-2', position === null && 'opacity-0')}
    >
      <div className="flex items-center gap-1 pb-1">
        <button
          type="button"
          aria-label={t('prevMonth')}
          disabled={!canGoPrev}
          onClick={() => moveCursor(addMonths(cursor, -1), false)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-foreground transition-[background-color] duration-fast ease-out hover:bg-secondary disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <Select aria-label={t('month')} value={month} onChange={(event) => changeMonthYear(year, Number(event.target.value))} className="px-2 pr-7 text-sm" wrapperClassName="min-w-0 flex-1">
          {months.map((name, index) => {
            const isOutside: boolean = isMonthOutside(year, index + 1, min, max);
            return (
              <option key={name} value={index + 1} disabled={isOutside}>
                {name}
              </option>
            );
          })}
        </Select>
        <Select aria-label={t('year')} value={year} onChange={(event) => changeMonthYear(Number(event.target.value), month)} className="px-2 pr-7 text-sm tabular-nums" wrapperClassName="w-[5.5rem] shrink-0">
          {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-label={t('nextMonth')}
          disabled={!canGoNext}
          onClick={() => moveCursor(addMonths(cursor, 1), false)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-foreground transition-[background-color] duration-fast ease-out hover:bg-secondary disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
      <table role="grid" aria-label={t('grid', { month: monthLabel })} aria-describedby={`${gridId}-hint`} onKeyDown={handleGridKey} className="w-full border-collapse">
        <thead>
          <tr>
            {weekdaysShort.map((name, index) => (
              <th key={name} scope="col" abbr={weekdaysLong[index]} className="size-11 p-0 text-center text-xs font-semibold text-muted-foreground">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.key}>
              {week.map((cell) => {
                const isSelected: boolean = cell.key === value;
                const isDisabled: boolean = !inRange(cell.key, min, max);
                return (
                  <td key={cell.key} role="gridcell" aria-selected={isSelected} className="p-0 text-center">
                    <button
                      type="button"
                      data-day={cell.key}
                      tabIndex={cell.key === cursor ? 0 : -1}
                      disabled={isDisabled}
                      aria-label={formatDateKey(cell.key, 'long', locale)}
                      aria-current={cell.key === today ? 'date' : undefined}
                      onClick={() => onSelect(cell.key)}
                      className={dayClass(isSelected, cell.key === today, cell.inMonth)}
                    >
                      {partsOf(cell.key).day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p id={`${gridId}-hint`} className="sr-only">
        {t('hint')}
      </p>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={!inRange(today, min, max)}
          onClick={() => onSelect(today)}
          className="inline-flex min-h-[44px] items-center rounded-control px-3 text-sm font-semibold text-primary-soft-foreground transition-[background-color] duration-fast ease-out hover:bg-primary-soft disabled:opacity-40"
        >
          {t('today')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A date field with a calendar popover (VF1). The field is plain text the visitor can type into (`27.10.2026`, an ISO day is
 * read too), the button opens a month grid (WAI-ARIA grid: arrows, Home/End, PageUp/PageDown, Enter, Esc), month and year
 * are two selects so a birth date is not forty clicks away. What the form holds is always ISO `YYYY-MM-DD` (`''` when empty
 * or unreadable), so schemas and API calls do not change. Month and weekday names come from `Intl` in the UI language.
 *
 * Controlled (`value` + `onChange(iso)`); with react-hook-form wrap it in `Controller`. The text being typed is kept
 * while the visitor is in the field, even when the form already holds an older day, and is shown as `дд.мм.гггг` after blur.
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { value, onChange, onBlur, min, max, wrapperClassName, className, disabled, ...rest },
  ref,
): ReactNode {
  const t = useT('ui.datePicker');
  const input = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const setInput = useCallback(
    (node: HTMLInputElement | null): void => {
      input.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref !== null) ref.current = node;
    },
    [ref],
  );
  const popoverId: string = useId();
  const [draft, setDraft] = useState<string>(() => formatTypedDate(value));
  const [isOpen, setIsOpen] = useState<boolean>(false);
  // The last value this field reported: a different `value` prop is a change from outside (reset, period moved by buttons) and replaces the text.
  const reported = useRef<string>(value);
  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    setDraft(formatTypedDate(value));
  }, [value]);

  const report = (next: string): void => {
    if (next === reported.current) return;
    reported.current = next;
    onChange(next);
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const text: string = event.target.value;
    setDraft(text);
    report(parseTypedDate(text) ?? '');
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    // A readable day is shown in the standard form; text that is not a day stays (and the field is marked) so the visitor sees what was refused.
    const day: string | null = parseTypedDate(draft);
    if (draft.trim() === '' || day !== null) setDraft(formatTypedDate(day ?? ''));
    onBlur?.(event);
  };
  const select = (key: string): void => {
    setDraft(formatTypedDate(key));
    report(key);
    setIsOpen(false);
    input.current?.focus();
  };
  const close = useCallback((restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) input.current?.focus();
  }, []);
  const isUnreadable: boolean = draft.trim() !== '' && parseTypedDate(draft) === null;
  return (
    <div ref={box} className={cn('relative w-full', FIELD_NARROW_CLASS, wrapperClassName)}>
      <input
        {...rest}
        ref={setInput}
        type="text"
        inputMode="decimal"
        autoComplete={rest.autoComplete ?? 'off'}
        maxLength={10}
        placeholder={t('placeholder')}
        disabled={disabled}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          rest.onKeyDown?.(event);
          if (event.altKey && event.key === 'ArrowDown' && disabled !== true) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-invalid={rest['aria-invalid'] === true || isUnreadable ? true : undefined}
        className={cn(FIELD_CLASS, 'pr-12 tabular-nums', className)}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={t('open')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] duration-fast ease-out hover:bg-secondary hover:text-foreground disabled:opacity-60"
      >
        <CalendarDays aria-hidden="true" className="size-5" />
      </button>
      {isOpen ? <CalendarPopover anchor={box.current} value={isDateKey(value) ? value : ''} min={min} max={max} onSelect={select} onClose={close} /> : null}
    </div>
  );
});
