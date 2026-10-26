/**
 * Look of every text-like form control, in one place: text and number inputs, textareas, selects and the date field.
 * 44 px tall like a button (VF4), the `--input` border (>= 3:1, WCAG 1.4.11), and a focus that is the primary border plus a
 * soft halo (`shadow-focus`) instead of the thick global outline. The outline is kept transparent, not removed: it still
 * draws in forced-colours mode, where box-shadow disappears. An invalid field turns its border and halo red; the message
 * with an icon under the field carries the meaning, so colour is never the only signal.
 */
export const FIELD_CLASS = [
  'block w-full min-h-[44px] rounded-control border border-input bg-card px-3 py-2 text-base text-foreground',
  'placeholder:text-muted-foreground',
  'transition-[border-color,box-shadow] duration-fast ease-out',
  'hover:border-muted-foreground',
  'focus:border-primary focus:shadow-focus focus:outline-transparent focus:outline-offset-0',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:border-destructive aria-[invalid=true]:focus:shadow-focus-danger',
  'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:opacity-60',
].join(' ');

/** Width of a field that holds a short value (a date, a number, a code): it must not stretch over the whole form. */
export const FIELD_NARROW_CLASS = 'max-w-[12rem]';

/** Width of a field that holds a short text (a name, a phone number). */
export const FIELD_MEDIUM_CLASS = 'max-w-md';
