export const FIELD_CLASS = [
  'block w-full min-h-[44px] rounded-control border border-input bg-card px-3 py-2 text-base text-foreground',
  'placeholder:text-muted-foreground',
  'transition-[border-color,box-shadow] duration-fast ease-out',
  'hover:border-muted-foreground',
  'focus:border-primary focus:shadow-focus focus:outline-transparent focus:outline-offset-0',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:border-destructive aria-[invalid=true]:focus:shadow-focus-danger',
  'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:opacity-60',
].join(' ');

export const FIELD_NARROW_CLASS = 'max-w-[12rem]';

export const FIELD_MEDIUM_CLASS = 'max-w-md';
