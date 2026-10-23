/** `@Transform` of free-text identifiers: padding is not part of the value; anything but a string is left to the validator. */
export function trimString({ value }: { readonly value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
